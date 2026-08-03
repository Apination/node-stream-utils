Apination Node Stream Utils
===========================

## Overview

A set of helper utils to work with remote streams

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

## getObjectSize()
returns the size of an object in bytes without downloading it. Accepts the same
locations as `createReadStream()` — `s3://`, `https://s3.amazonaws.com/`,
`file://`, and the `{ $src }` envelope. For S3 this is a `headObject` call, so
only metadata is transferred.

Use it to decide how to send a file before sending it, for example choosing
between a single request and a chunked or signed upload flow.

```js
const size = await utils.getObjectSize(TEST_DATA_SRC);

if (size > 25 * 1024 * 1024) {
	// too large for one request — use the signed upload flow
}
```

It answers for the stream `createReadStream()` would produce. A range location
(`?offset=&length=`) therefore returns its `length`, with no request made at all.
Ranges on `file://` locations are rejected, because `createReadStream()` does not
honour them there either.

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

### Upload options (`partSize` / `queueSize`)

`createWriteStream(destination, cb, throwError, uploadOptions)` accepts an
optional 4th argument that is forwarded verbatim to the S3
[ManagedUpload](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property).
It is fully backward compatible — when omitted, the previous SDK defaults
(`partSize` 5 MB, `queueSize` 4) apply. Use it to bound peak memory when
uploading many large objects concurrently:

```js
// Cap the in-flight multipart buffer per upload (~partSize * queueSize).
utils.createWriteStream(destination, cb, false, { partSize: 5 * 1024 * 1024, queueSize: 2 });
```

`createWriteArrayStream()` accepts the same optional `uploadOptions` argument.

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
-	peer — supplied by the consumer, required by the entry point at load time
	-	[aws-sdk](https://www.npmjs.com/package/aws-sdk) v2. Declared as a peer rather
		than a dependency because the Lambda runtime already provides it, and
		shipping it would add the whole SDK to every consumer bundle.
-	development
	-	[aws-sdk](https://www.npmjs.com/package/aws-sdk)
	-	[mocha](https://www.npmjs.com/package/mocha)
	-	[chai](https://www.npmjs.com/package/mocha)
