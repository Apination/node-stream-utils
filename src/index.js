'use strict';

const fs = require('fs');
const aws = require('aws-sdk');
const debug = require('debug')('apination:stream-reader');
const PassThrough = require('stream').PassThrough;
const JSONStream = require('JSONStream');

const RX_S3 = /^s3:\/\/([^/]+)\/(.+)$/;
const RX_FILE = /^file:\/\/(.+)$/;
const OBJECT_SOURCE_KEY = '$src';

/**
 * Creates a text read stream for a given url
 * @param	{string}	url	Remote source location in format s3:// or file://
 * @return	{object}	Readable stream
 */
exports.createReadStream = function createReadStream(url) {
	if (typeof url !== 'string' || !url.length) throw new TypeError('url argument must be a non-empty String');

	// TODO: file read must be turned off in production

	if (RX_FILE.test(url)) {
		const m = url.match(RX_FILE);
		const fileName = m[1];
		return fs.createReadStream(fileName);
	}
	else if (RX_S3.test(url)) {
		const m = url.match(RX_S3);
		const bucketName = m[1];
		const fileName = m[2];
		const s3 = new aws.S3();

		return s3.getObject({ Bucket: bucketName, Key: fileName }).createReadStream();
	}
	else {
		throw new Error('Unexpected url format: ' + url);
	}
};

/**
 * Creates an object read stream for a given url
 * @param	{string}	url	Remote source location in format s3:// or file://
 * @return	{object}	Readable object stream
 */
exports.createReadArrayStream = function createReadArrayStream(url) {
	return exports.createReadStream(url)
		.pipe(JSONStream.parse('*'));
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
		Key: m[2],
		Body: passThroughStream,
		ContentType: 'application/json'
	};

	debug(`uploading to ${params.Bucket}/${params.Key}...`);

	s3.upload(params, function (err, data) {
		if (err) {
			debug(`${url} upload failed`);
			debug(err);
		}
		else {
			debug(`${url} uploaded`);
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
		const url = input[key] && input[key][OBJECT_SOURCE_KEY];
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
