'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const expect = require('chai').expect;

const utils = require('../../src');

describe('loadJson() multi-byte characters', () => {

	let filePath;

	beforeEach(() => {
		filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'load-json-')), 'payload.json');
	});

	afterEach(() => {
		fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
	});

	// A 1-byte read buffer makes every multi-byte character straddle two chunks,
	// which is what happened to "ч" in a KW Command note (AP20-2208).
	const loadJsonInOneByteChunks = (url) => {
		const originalCreateReadStream = fs.createReadStream;

		fs.createReadStream = (file, options) => originalCreateReadStream(file, { ...options, highWaterMark: 1 });

		return utils.loadJson(url).finally(() => {
			fs.createReadStream = originalCreateReadStream;
		});
	};

	it('keeps 2-byte letters intact when they are split across chunks', async () => {
		const notes = [{ note: 'Богдан просить перенести перегляд на ранок' }];

		fs.writeFileSync(filePath, JSON.stringify(notes));

		const result = await loadJsonInOneByteChunks(`file://${filePath}`);

		expect(result).to.deep.equal(notes);
	});

	it('keeps 3- and 4-byte characters intact when they are split across chunks', async () => {
		const notes = [{ note: 'Café €100 – see you 🙂' }];

		fs.writeFileSync(filePath, JSON.stringify(notes));

		const result = await loadJsonInOneByteChunks(`file://${filePath}`);

		expect(result).to.deep.equal(notes);
	});
});
