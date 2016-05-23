Apination Node Stream Utils
===========================

## Overview

A set of helper utils to work with remote streams

```bash
npm install git+ssh://git@bitbucket.org:apination/node-stream-utils.git --save
```

```js
const utils = require('apination-stream-utils');
```

## createReadStream()
loads data from S3.

```js
const TEST_DATA_SRC = 's3://apination-cn-data/staging/cn-example/transactions.json';
const data = [];
const stream = utils.createReadStream(TEST_DATA_SRC);
stream.on('data', chunk => data.push(chunk.toString()));
stream.on('end', () => {
	data.should.have.length(1);
	data[0].should.be.a('String');
	done();
});
```

## createReadArrayStream()
loads JSON array from S3.

```js
const data = [];
const stream = utils.createReadArrayStream(TEST_DATA_SRC);
stream.on('data', chunk => data.push(chunk));
stream.on('end', () => {
	data.should.have.length(2);
	data[0].should.be.an('Object');
	done();
});
```

## createWriteStream()
writes stream to S3.

```js
utils.createReadStream(TEST_DATA_SRC)
	.pipe(utils.createWriteStream(TEST_DATA_SRC + '.out.txt', (err, data) => {
		expect(err).to.not.exist;
		expect(data).to.be.an('Object');
		expect(data).to.have.property('Bucket', 'apination-cn-data');
		expect(data).to.have.property('Key', 'staging/cn-example/transactions.json.out.txt');
	}));
```

## createArrayWriteStream()
writes json array to S3.

```js
utils.createReadArrayStream(TEST_DATA_SRC)
	.pipe(utils.createWriteArrayStream(TEST_DATA_SRC + '.out.json', (err, data) => {
		expect(err).to.not.exist;
		expect(data).to.be.an('Object');
		expect(data).to.have.property('Bucket', 'apination-cn-data');
		expect(data).to.have.property('Key', 'staging/cn-example/transactions.json.out.json');
	}));
```

## loadJson()
loads JSON object from S3.

```js
utils.loadJson(TEST_DATA_SRC).then(json => {
	expect(json).to.be.an('Array').that.has.length(2);
});
```

## loadRemoteResources()
loads JSON objects from S3, when defined as { $src: "" }.

```js
const input = {
	remoteResource: { $src: TEST_DATA_SRC },
	anotherResource: { foo: 'bar' }
};
utils.loadRemoteResources(input, ['remoteResource', 'anotherResource']).then(obj => {
	expect(obj).to.have.property('remoteResource').that.is.an('Array').that.has.length(2);
	expect(obj).to.have.deep.property('anotherResource.foo', 'bar');
});
```


## Dependencies

package.json (installed automatically with `npm i`)

-	[JSONStream](https://www.npmjs.com/package/JSONStream)
-	[debug](https://www.npmjs.com/package/debug)
-	development
	-	[aws-sdk](https://www.npmjs.com/package/aws-sdk)
	-	[mocha](https://www.npmjs.com/package/mocha)
	-	[chai](https://www.npmjs.com/package/mocha)
