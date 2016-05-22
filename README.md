Apination Node Stream Utils
===========================

## Overview

A set of helper utils to work with remote streams

```bash
npm install git+ssh://git@bitbucket.org:apination/node-stream-utils.git
```

```js
const utils = require('apination-stream-utils');
```

<a name="stream-utils-createreadstream"></a>
## createReadStream()
loads data from S3.

```js
const TRANSACTIONS_URL = 's3://apination-cn-data/staging/cn-example/transactions.json';
const data = [];
const stream = utils.createReadStream(TRANSACTIONS_URL);
stream.on('data', chunk => data.push(chunk.toString()));
stream.on('end', () => {
	data.should.have.length(1);
	data[0].should.be.a('String');
	done();
});
```

<a name="stream-utils-createreadarraystream"></a>
## createReadArrayStream()
loads JSON array from S3.

```js
const data = [];
const stream = utils.createReadArrayStream(TRANSACTIONS_URL);
stream.on('data', chunk => data.push(chunk));
stream.on('end', () => {
	data.should.have.length(2);
	data[0].should.be.an('Object');
	done();
});
```

<a name="stream-utils-createwritestream"></a>
## createWriteStream()
writes stream to S3.

```js
utils.createReadStream(TRANSACTIONS_URL)
	.pipe(utils.createWriteStream(TRANSACTIONS_URL + '.out.txt', (err, data) => {
		expect(err).to.not.exist;
		expect(data).to.be.an('Object');
		expect(data).to.have.property('Bucket', 'apination-cn-data');
		expect(data).to.have.property('Key', 'staging/cn-example/transactions.json.out.txt');
	}));
```

<a name="stream-utils-createarraywritestream"></a>
## createArrayWriteStream()
writes json array to S3.

```js
utils.createReadArrayStream(TRANSACTIONS_URL)
	.pipe(utils.createWriteArrayStream(TRANSACTIONS_URL + '.out.json', (err, data) => {
		expect(err).to.not.exist;
		expect(data).to.be.an('Object');
		expect(data).to.have.property('Bucket', 'apination-cn-data');
		expect(data).to.have.property('Key', 'staging/cn-example/transactions.json.out.json');
	}));
```

<a name="stream-utils-loadjson"></a>
## loadJson()
loads JSON object from S3.

```js
utils.loadJson(TRANSACTIONS_URL).then(json => {
	expect(json).to.be.an('Array').that.has.length(2);
});
```

<a name="stream-utils-loadremoteresources"></a>
## loadRemoteResources()
loads JSON objects from S3, when defined as { $src: "" }.

```js
const input = {
	remoteResource: { $src: TRANSACTIONS_URL },
	anotherResource: { foo: 'bar' }
};
utils.loadRemoteResources(input, ['remoteResource', 'anotherResource']).then(obj => {
	expect(obj).to.have.property('remoteResource').that.is.an('Array').that.has.length(2);
	expect(obj).to.have.deep.property('anotherResource.foo', 'bar');
});
```


## Dependencies

-	package.json (installed automatically with `npm i`)
	-	[JSONStream](https://www.npmjs.com/package/JSONStream)
	-	[debug](https://www.npmjs.com/package/debug)
	-	development
		-	[aws-sdk](https://www.npmjs.com/package/aws-sdk)
		-	[mocha](https://www.npmjs.com/package/mocha)
		-	[chai](https://www.npmjs.com/package/mocha)
