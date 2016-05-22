'use strict';

const utils = require('../../src');
const expect = require('chai').expect;
const TEST_DATA_SRC = 's3://apination-cn-data/staging/cn-example/transactions.json';

require('aws-sdk').config.update(require('./credentials.json'));

describe('stream-utils', function () {

	this.timeout(10000);
	this.slow(5000);

	describe('createReadStream()', () => {

		it('loads data from S3', done => {

			const data = [];
			const stream = utils.createReadStream(TEST_DATA_SRC);

			stream.on('data', chunk => data.push(chunk.toString()));
			stream.on('end', () => {
				expect(data).to.have.length(1);
				expect(data[0]).to.be.a('String');
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

		it('writes stream to S3', done => {

			utils.createReadStream(TEST_DATA_SRC)
				.pipe(utils.createWriteStream(TEST_DATA_SRC + '.out.txt', (err, data) => {
					expect(err).to.not.exist;
					expect(data).to.be.an('Object');
					expect(data).to.have.property('Bucket', 'apination-cn-data');
					expect(data).to.have.property('Key', 'staging/cn-example/transactions.json.out.txt');
					done();
				}));
		});
	});

	describe('createArrayWriteStream()', () => {

		it('writes json array to S3', done => {

			utils.createReadArrayStream(TEST_DATA_SRC)
				.pipe(utils.createWriteArrayStream(TEST_DATA_SRC + '.out.json', (err, data) => {
					expect(err).to.not.exist;
					expect(data).to.be.an('Object');
					expect(data).to.have.property('Bucket', 'apination-cn-data');
					expect(data).to.have.property('Key', 'staging/cn-example/transactions.json.out.json');
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
	});
});


