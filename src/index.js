'use strict';

const fs = require('fs');
const aws = require('aws-sdk');
const debug = require('debug')('apination:streams');
const PassThrough = require('stream').PassThrough;
const JSONStream = require('JSONStream');
const es = require('event-stream');
const uuid = require('uuid');

const RX_S3 = /^(?:s3:\/\/|https:\/\/s3.amazonaws.com\/)([^/]+)\/(.+)$/i;
const RX_FILE = /^file:\/\/(.+)$/;
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
		const params = {
			Bucket: m[1],
			Key: m[2]
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
 * @param	{string}	url	Where the data should be uploaded to
 * @param 	{Function}	cb	Callback to execute when the upload if complete
 * @return	{object}	Writable stream
 */
exports.createWriteStream = function createWriteStream(url, cb) {
	if (typeof url !== 'string' || !url.length) throw new TypeError('url argument must be a non-empty String');
	if (!RX_S3.test(url)) throw new TypeError('unexpected url argument format: ' + url);
	if (cb && typeof cb !== 'function') throw new TypeError('cb argument, when provided, must be a Function');

	const m = url.match(RX_S3);
	const passThroughStream = new PassThrough();
	const s3 = new aws.S3();
	const params = {
		Bucket: m[1],
		Key: m[2] + uuid.v4().replace(RX_DASHES, ''),
		Body: passThroughStream,
		ContentType: 'application/json'
	};

	const uploadingTo = `s3://${params.Bucket}/${params.Key}`;
	debug(`uploading to ${uploadingTo}...`);

	s3.upload(params, function (err, data) {
		if (err) {
			debug(`${uploadingTo} upload failed`);
			debug(err);
		}
		else {
			debug(`${uploadingTo} uploaded`);
			data[OBJECT_SOURCE_KEY] = uploadingTo;
		}
		if (cb) cb(err, data);
	});

	return passThroughStream;
};

/**
 * Creates an object write stream for a given url
 * @param	{string}	url	Where the data should be uploaded to
 * @param 	{Function}	cb	Callback to execute when the upload if complete
 * @return	{object}	Writable object stream
 */
exports.createWriteArrayStream = function createWriteArrayStream(url, cb) {
	const stringify = JSONStream.stringify();
	stringify.pipe(exports.createWriteStream(url, cb));
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
			typeof value === 'string' && RX_S3.test(value) ? value : undefined;

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
