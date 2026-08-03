'use strict';

const fs = require('fs');
const aws = require('aws-sdk');
const debug = require('debug')('apination:streams');
const PassThrough = require('stream').PassThrough;
const JSONStream = require('JSONStream');
const es = require('event-stream');
const uuid = require('uuid');

const RX_S3 = /^(?:s3:\/\/|https:\/\/s3.amazonaws.com\/)([^/]+)\/([^?]+)(?:\?offset=(\d+)&length=(\d+))?$/i;
const RX_FILE = /^file:\/\/(.+)$/;
const RX_RANGE = /[?&]offset=\d+&length=\d+$/i;
const RX_DASHES = /-/g;
const OBJECT_SOURCE_KEY = '$src';

/**
 * Creates a text read stream for a given url
 * @param {string|{$src:string}} url	Remote source location in format s3:// or file://
 * @return {object}	Readable stream
 */
exports.createReadStream = function createReadStream(url) {
	if (typeof url === 'object' && url && (OBJECT_SOURCE_KEY in url)) url = url[OBJECT_SOURCE_KEY];
	if (typeof url !== 'string' || !url.length) throw new TypeError('url argument must be a non-empty String');

	if (RX_S3.test(url)) {
		const m = url.match(RX_S3);

		const offset = m[3] ? +m[3] : null;
		const length = m[4] ? +m[4] : null;
		const params = {
			Bucket: m[1],
			Key: m[2],
			// An HTTP byte range is inclusive at both ends, so the last byte of a
			// `length`-byte slice is at `offset + length - 1`. Asking for
			// `offset + length` returned one byte too many on every range read. It went
			// unnoticed because the writers of these ranges separate records with a
			// newline and JSON.parse ignores trailing whitespace - it would corrupt any
			// range whose next byte is not whitespace.
			Range: offset !== null && length !== null ? `bytes=${offset}-${offset + length - 1}` : undefined
		};

		const s3 = new aws.S3();
		return s3.getObject(params).createReadStream();
	}
	else if (RX_FILE.test(url)) {
		const m = url.match(RX_FILE);
		const fileName = m[1];
		return fs.createReadStream(fileName);
	}
	else {
		throw new Error('Unexpected url format: ' + url);
	}
};

/**
 * Returns the size in bytes of an object, without downloading it.
 *
 * Accepts every location form createReadStream accepts - an s3:// uri, the
 * https://s3.amazonaws.com/ equivalent, a file:// path, and the { $src } envelope
 * upstream steps wrap one in - so that anything streamable is also sizeable.
 * For S3 this is a headObject call: metadata only, no body transferred.
 *
 * Answers for the stream createReadStream would produce, which for a range url is
 * its `length` and needs no request at all. Ranges on file:// locations are refused,
 * because createReadStream does not honour them there either.
 *
 * `async` so that every failure - a bad argument, an unsupported location, a
 * missing local file, an S3 error - reaches the caller as a rejection. A caller
 * writing `getObjectSize(src).then(...).catch(handle)` must not have some of these
 * escape past `handle` because they were thrown while evaluating the argument.
 *
 * @param {string|{$src:string}} url	Remote source location in format s3:// or file://
 * @return {Promise<number>}	Size of the object in bytes
 */
exports.getObjectSize = async function getObjectSize(url) {
	if (typeof url === 'object' && url && (OBJECT_SOURCE_KEY in url)) url = url[OBJECT_SOURCE_KEY];
	if (typeof url !== 'string' || !url.length) throw new TypeError('url argument must be a non-empty String');

	if (RX_S3.test(url)) {
		const m = url.match(RX_S3);

		// A range url describes its own size: createReadStream emits exactly that
		// many bytes, so answering from the url is both correct and free of a request.
		if (m[4]) return +m[4];

		debug(`sizing s3://${m[1]}/${m[2]}...`);

		const s3 = new aws.S3();
		const head = await s3.headObject({ Bucket: m[1], Key: m[2] }).promise();

		// Callers gate "small enough to send in one request" on this number, so an
		// unknown size must never read as 0 - while a genuinely empty object must.
		if (head.ContentLength === undefined || head.ContentLength === null) {
			throw new Error('Object reported no ContentLength: ' + url);
		}

		debug(`s3://${m[1]}/${m[2]} is ${head.ContentLength} bytes`);

		return head.ContentLength;
	}
	else if (RX_FILE.test(url)) {
		// RX_FILE is greedy, so a range suffix ends up inside the path. createReadStream
		// does not honour ranges for file:// either, so refusing is honest - otherwise
		// the caller gets ENOENT naming a file that never existed.
		if (RX_RANGE.test(url)) {
			throw new Error('getObjectSize does not support range urls for file:// locations: ' + url);
		}

		const m = url.match(RX_FILE);
		return fs.statSync(m[1]).size;
	}
	else {
		throw new Error('Unexpected url format: ' + url);
	}
};

/**
 * Creates an object read stream for a given url
 * @param	{string|any[]}	source	Remote source location in format "s3://..." or Array
 * @return	{object}	Readable object stream
 */
exports.createReadArrayStream = function createReadArrayStream(source) {
	if (Array.isArray(source)) {
		return es.readArray(source);
	}
	else {
		return exports.createReadStream(source).pipe(JSONStream.parse('*'));
	}
};

/**
 * Creates a text write stream for a given url
 *
 * @param	{{bucketName: string, keyPrefix: string}|string}	destination	Where the data should be uploaded to
 * @param 	{Function}	cb	Callback to execute when the upload if complete
 * @param	{boolean}	[throwError=false]	Re-throw upload errors instead of swallowing them
 * @param	{object}	[uploadOptions={}]	Options forwarded to S3 ManagedUpload (e.g. { partSize, queueSize }).
 *						Defaults to an empty object, which preserves the previous SDK defaults.
 * @return	{object}	Writable stream
 */
exports.createWriteStream = function createWriteStream(destination, cb, throwError = false, uploadOptions = {}) {
	if (!destination) throw new TypeError('destination argument required');
	if (typeof destination === 'string') {
		const m = destination.match(RX_S3);
		if (!m) throw new TypeError('unexpected destination format: ' + destination);
		destination = {
			bucketName: m[1],
			keyPrefix: m[2]
		};
	}
	else if (typeof destination === 'object') {
		if (!destination.bucketName) throw new TypeError('destination.bucketName argument required');
		if (!destination.keyPrefix) throw new TypeError('destination.keyPrefix argument required');
	}
	else {
		throw new TypeError('destination must be either a String in format "s3://bucketName/keyPrefix" or an Object {bucketName: string, keyPrefix: string}');
	}
	if (cb && typeof cb !== 'function') throw new TypeError('cb argument, when provided, must be a Function');
	if (uploadOptions === null || typeof uploadOptions !== 'object') throw new TypeError('uploadOptions argument, when provided, must be an Object');

	const passThroughStream = new PassThrough();
	if (cb) passThroughStream.on('error', cb);

	const s3 = new aws.S3();
	const params = {
		Bucket: destination.bucketName,
		Key: destination.key ? destination.key : destination.keyPrefix + uuid.v4().replace(RX_DASHES, ''),
		Body: passThroughStream,
		ContentType: destination.contentType ? destination.contentType : 'application/json'
	};

	const uploadingTo = `s3://${params.Bucket}/${params.Key}`;
	// debug(`uploading to ${uploadingTo}...`);

	passThroughStream.writing = true

	// console.log(passThroughStream)

	s3.upload(params, uploadOptions, function (err, data) {
		passThroughStream.writing = false
		if (err) {
			debug(`${uploadingTo} upload failed`);
			debug(err);
			if (throwError) {
				throw err
			}
		}
		else {
			// debug(`${uploadingTo} uploaded`);
			data[OBJECT_SOURCE_KEY] = uploadingTo;
			passThroughStream[OBJECT_SOURCE_KEY] = uploadingTo;
		}
		if (cb) cb(err, data);
	});

	return passThroughStream;
};

/**
 * Creates an object write stream for a given url
 * @param	{string}	url	Where the data should be uploaded to
 * @param 	{Function}	cb	Callback to execute when the upload if complete
 * @param	{boolean}	[throwError=false]	Re-throw upload errors instead of swallowing them
 * @param	{object}	[uploadOptions={}]	Options forwarded to S3 ManagedUpload (e.g. { partSize, queueSize })
 * @return	{object}	Writable object stream
 */
exports.createWriteArrayStream = function createWriteArrayStream(url, cb, throwError = false, uploadOptions = {}) {
	const stringify = JSONStream.stringify();
	const writeStream = exports.createWriteStream(url, cb, throwError, uploadOptions)
	stringify.pipe(writeStream);

	Object.defineProperty(
		stringify,
		'writing', { get: () => writeStream.writing }
	);

	return stringify;
};

/**
 * Reads JSON from a given file:// or s3:// source
 * @param	{string}	url	Remote source location in format s3:// or file://
 * @return	{Promise<String>}
 */
exports.loadJson = function loadJson(url) {
	if (typeof url !== 'string' || !url.length) throw new TypeError('url argument must be a non-empty String');

	return new Promise(function (resolve, reject) {

		const stream = exports.createReadStream(url);
		let r = '';

		stream.on('error', reject);

		stream.on('data', buffer => {
			r += buffer.toString();
		});

		stream.on('end', () => {
			resolve(JSON.parse(r));
		});
	});
};


function* createDownloadTasks(input, keys) {
	if (typeof input !== 'object' || !input) throw new TypeError('input argument must be an Object');
	if (!Array.isArray(keys)) throw new TypeError('keys argument must be an Array');

	for (const key of keys) {
		const value = input[key];
		const url = typeof value === 'object' && (OBJECT_SOURCE_KEY in value) ? value[OBJECT_SOURCE_KEY] :
			typeof value === 'string' && RX_S3.test(value) ? value :
				undefined;

		if (url) {
			debug(`downloading ${key} from ${url}...`);

			yield exports.loadJson(url)
				.then(json => {
					debug(`${key} downloaded`);
					return json;
				})
				.then(json => ({ [key]: json }));
		}
	}
}

/**
 * Loads remote resources defined on the input object as "key: { $src: '' }"
 * @param 	{Object}	input	Container object with remote resource links
 * @param	{string[]|string}	keys	Object keys to check and download
 * @return	{Promise<Object>}	Original input with downloaded resources
 */
exports.loadRemoteResources = function (input, keys) {
	if (typeof input !== 'object' || !input) throw new TypeError('input argument must be an Object');
	if (!Array.isArray(keys) && typeof keys !== 'string') throw new TypeError('keys argument must be either an Array or a String');

	if (!Array.isArray(keys))
		keys = Array.prototype.slice.call(arguments, 1);

	const downloadTasks = Array.from(createDownloadTasks(input, keys));

	return Promise.all(downloadTasks)
		.then(downloadedResources =>
			Object.assign.apply(null, [input].concat(downloadedResources)));
};
