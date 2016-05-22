'use strict';

const aws = require('aws-sdk');
const utils = require('../../src');
const chai = require('chai');
const expect = chai.expect;
const credentials = require('./credentials.json');
const TRANSACTIONS_URL = 's3://apination-cn-data/staging/cn-example/transactions.json';

aws.config.update(credentials);
chai.should();

describe('stream-utils', function () {

	this.timeout(10000);
	this.slow(5000);

	describe('createReadStream()', () => {

		it('loads data from S3', done => {

			const data = [];
			const stream = utils.createReadStream(TRANSACTIONS_URL);

			stream.on('data', chunk => data.push(chunk.toString()));
			stream.on('end', () => {
				data.should.have.length(1);
				data[0].should.be.a('String');
				done();
			});
		});
	});


	describe('createReadArrayStream()', () => {

		it('loads JSON array from S3', done => {

			const data = [];
			const stream = utils.createReadArrayStream(TRANSACTIONS_URL);

			stream.on('data', chunk => data.push(chunk));
			stream.on('end', () => {
				data.should.have.length(2);
				data[0].should.be.an('Object');
				done();
			});
		});
	});

	describe('createWriteStream()', () => {

		it('writes stream to S3', done => {

			utils.createReadStream(TRANSACTIONS_URL)
				.pipe(utils.createWriteStream(TRANSACTIONS_URL + '.out.txt', (err, data) => {
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

			utils.createReadArrayStream(TRANSACTIONS_URL)
				.pipe(utils.createWriteArrayStream(TRANSACTIONS_URL + '.out.json', (err, data) => {
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

			return utils.loadJson(TRANSACTIONS_URL).then(json => {
				expect(json).to.be.an('Array').that.has.length(2);
			});
		});
	});

	describe('loadRemoteResources()', () => {

		it('loads JSON objects from S3, when defined as { $src: "" }', () => {

			const input = {
				remoteResource: { $src: TRANSACTIONS_URL },
				anotherResource: { foo: 'bar' }
			};

			return utils.loadRemoteResources(input, ['remoteResource', 'anotherResource']).then(obj => {
				expect(obj).to.have.property('remoteResource').that.is.an('Array').that.has.length(2);
				expect(obj).to.have.deep.property('anotherResource.foo', 'bar');
			});
		});
	});
});


