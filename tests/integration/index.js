'use strict';

require('debug').enable('apination:*');

const utils = require('../../src');
const expect = require('chai').expect;
const TEST_DATA_SRC = 's3://apination-cn-data/staging/cn-example/transactions.json';
const TEST_DATA_SRC_RANGE = '?offset=3&length=548';
const TEST_OUTPUT_DESTINATION = {
	bucketName: 'apination-intermediate-data-stg',
	keyPrefix: '2001/01/01/00-00-00-000-TEST-'
};

require('aws-sdk').config.update(require('./credentials.json'));

describe('stream-utils', function () {

	this.timeout(10000);
	this.slow(5000);

	describe('createReadStream()', () => {

		it('loads data from S3', done => {

			const data = [];
			const stream = utils.createReadStream(TEST_DATA_SRC);

			stream.on('error', done);
			stream.on('data', chunk => data.push(chunk.toString()));
			stream.on('end', () => {
				expect(data).to.have.length(1);
				expect(data[0]).to.be.a('String');
				expect(data[0][0]).to.eq('[');
				expect(data[0][data[0].length - 2]).to.eq(']');
				done();
			});
		});

		it('downloads PARTIAL data from S3', done => {

			const data = [];
			const stream = utils.createReadStream(TEST_DATA_SRC + TEST_DATA_SRC_RANGE);

			stream.on('error', done);
			stream.on('data', chunk => {
				data.push(chunk.toString());
			});
			stream.on('end', () => {
				expect(data).to.have.length(1);
				expect(data[0]).to.be.a('String');
				expect(data[0][0]).to.eq('{');
				expect(data[0][data[0].length - 1]).to.eq('}');
				done();
			});
		});
	});


	describe('createReadArrayStream()', () => {

		it('loads JSON array from S3', done => {

			const data = [];
			const stream = utils.createReadArrayStream(TEST_DATA_SRC);

			stream.on('data', chunk => data.push(chunk));
			stream.on('end', () => {
				expect(data).to.have.length(2);
				expect(data[0]).to.be.a('Object');
				done();
			});
		});
	});

	describe('createWriteStream()', () => {

		it('throws TypeError when incorrect arguments received', () => {
			expect(() => utils.createWriteStream({ bucketName: 'test' })).to.throw(TypeError);
			expect(() => utils.createWriteStream({ keyPrefix: 'test' })).to.throw(TypeError);
			expect(() => utils.createWriteStream('')).to.throw(TypeError);
			expect(() => utils.createWriteStream('s3://test')).to.throw(TypeError);
		});

		it('writes stream to S3', done => {

			utils.createReadStream(TEST_DATA_SRC)
				.pipe(utils.createWriteStream(TEST_OUTPUT_DESTINATION, (err, data) => {
					expect(err).to.not.exist;
					expect(data).to.be.an('Object');
					expect(data).to.have.property('Bucket', TEST_OUTPUT_DESTINATION.bucketName);
					expect(data).to.have.property('Key');
					expect(data).to.have.property('$src');
					done();
				}));
		});
	});

	describe('createArrayWriteStream()', () => {

		it('writes json array to S3', done => {

			utils.createReadArrayStream(TEST_DATA_SRC)
				.pipe(utils.createWriteArrayStream(TEST_OUTPUT_DESTINATION, (err, data) => {
					expect(err).to.not.exist;
					expect(data).to.be.an('Object');
					expect(data).to.have.property('Bucket', TEST_OUTPUT_DESTINATION.bucketName);
					expect(data).to.have.property('Key');
					expect(data).to.have.property('$src');
					done();
				}));
		});
	});

	describe('loadJson()', () => {

		it('loads JSON object from S3', () => {

			return utils.loadJson(TEST_DATA_SRC).then(json => {
				expect(json).to.be.an('Array').that.has.length(2);
			});
		});

		it('loads JSON object ELEMENT from S3 with element range provided', () => {
			return utils.loadJson(TEST_DATA_SRC + TEST_DATA_SRC_RANGE).then(json => {
				expect(json).to.not.be.an('Array');
				expect(json).to.be.an('Object');
			});
		});
	});

	describe('loadRemoteResources()', () => {

		it('loads JSON objects from S3, when defined as { $src: "" }', () => {

			const input = {
				remoteResource: { $src: TEST_DATA_SRC },
				anotherResource: { foo: 'bar' }
			};

			return utils.loadRemoteResources(input, ['remoteResource', 'anotherResource']).then(obj => {
				expect(obj).to.have.property('remoteResource').that.is.an('Array').that.has.length(2);
				expect(obj).to.have.deep.property('anotherResource.foo', 'bar');
			});
		});

		it('loads JSON objects from S3, when defined as "s3://..."', () => {

			const input = {
				remoteResource: TEST_DATA_SRC,
				anotherResource: 'bar'
			};

			return utils.loadRemoteResources(input, ['remoteResource', 'anotherResource']).then(obj => {
				expect(obj).to.have.property('remoteResource').that.is.an('Array').that.has.length(2);
				expect(obj).to.have.property('anotherResource', 'bar');
			});
		});
	});
});


