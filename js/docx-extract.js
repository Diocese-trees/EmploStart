/*
 * EmploStart: a zero-dependency .docx text extractor.
 *
 * A .docx file is a ZIP container. We read the central directory ourselves,
 * pull word/document.xml, inflate it with the browser's native
 * DecompressionStream('deflate-raw'), and walk the paragraphs. No pdf.js, no
 * mammoth, no network: the file never leaves the page.
 *
 * Public surface: window.EmploStartDocx
 */
(function () {
    'use strict';

    var EOCD = 0x06054b50;
    var CENTRAL = 0x02014b50;
    var LOCAL = 0x04034b50;

    function findEndOfCentralDirectory(view) {
        var max = Math.max(0, view.byteLength - 66000);
        for (var i = view.byteLength - 22; i >= max; i -= 1) {
            if (view.getUint32(i, true) === EOCD) { return i; }
        }
        return -1;
    }

    function readEntries(buffer) {
        var view = new DataView(buffer);
        var eocd = findEndOfCentralDirectory(view);
        if (eocd === -1) { throw new Error('Not a ZIP container'); }
        var count = view.getUint16(eocd + 10, true);
        var offset = view.getUint32(eocd + 16, true);
        var entries = {};
        var cursor = offset;
        for (var i = 0; i < count; i += 1) {
            if (view.getUint32(cursor, true) !== CENTRAL) { break; }
            var method = view.getUint16(cursor + 10, true);
            var compressed = view.getUint32(cursor + 20, true);
            var nameLen = view.getUint16(cursor + 28, true);
            var extraLen = view.getUint16(cursor + 30, true);
            var commentLen = view.getUint16(cursor + 32, true);
            var localOffset = view.getUint32(cursor + 42, true);
            var name = new TextDecoder('utf-8').decode(new Uint8Array(buffer, cursor + 46, nameLen));
            entries[name] = { method: method, compressed: compressed, localOffset: localOffset };
            cursor += 46 + nameLen + extraLen + commentLen;
        }
        return entries;
    }

    function compressedBytes(buffer, entry) {
        var view = new DataView(buffer);
        if (view.getUint32(entry.localOffset, true) !== LOCAL) {
            throw new Error('Corrupt local header');
        }
        var nameLen = view.getUint16(entry.localOffset + 26, true);
        var extraLen = view.getUint16(entry.localOffset + 28, true);
        var start = entry.localOffset + 30 + nameLen + extraLen;
        return new Uint8Array(buffer, start, entry.compressed);
    }

    function inflateRaw(bytes) {
        if (typeof DecompressionStream === 'undefined') {
            return Promise.reject(new Error('This browser cannot inflate .docx files. Paste the text instead.'));
        }
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).arrayBuffer();
    }

    function decodeEntities(text) {
        return text
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, function (m, code) { return String.fromCharCode(Number(code)); })
            .replace(/&amp;/g, '&');
    }

    function textFromRuns(node) {
        var parts = [];
        var walker = node.childNodes || [];
        for (var i = 0; i < walker.length; i += 1) {
            var child = walker[i];
            var name = child.nodeName ? child.nodeName.toLowerCase() : '';
            if (name === 'w:t') {
                parts.push(child.textContent || '');
            } else if (name === 'w:tab') {
                parts.push('\t');
            } else if (name === 'w:br' || name === 'w:cr') {
                parts.push('\n');
            } else if (child.childNodes && child.childNodes.length) {
                parts.push(textFromRuns(child));
            }
        }
        return parts.join('');
    }

    function xmlToText(xml) {
        if (typeof DOMParser !== 'undefined') {
            var doc = new DOMParser().parseFromString(xml, 'application/xml');
            var paragraphs = doc.getElementsByTagName('w:p');
            var lines = [];
            for (var i = 0; i < paragraphs.length; i += 1) {
                lines.push(textFromRuns(paragraphs[i]).replace(/\s+$/g, ''));
            }
            return lines.filter(function (line, index) {
                return line.length > 0 || (index > 0 && lines[index - 1].length > 0);
            }).join('\n');
        }
        var blocks = xml.split(/<\/w:p>/);
        return blocks.map(function (block) {
            var runs = [];
            var pattern = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g;
            var match = pattern.exec(block);
            while (match) {
                runs.push(decodeEntities(match[1]));
                match = pattern.exec(block);
            }
            if (/<w:tab\/>/.test(block)) { runs.push('\t'); }
            return runs.join('');
        }).filter(function (line) { return line.trim().length > 0; }).join('\n');
    }

    function extract(buffer) {
        return new Promise(function (resolve, reject) {
            try {
                var entries = readEntries(buffer);
                var target = entries['word/document.xml'];
                if (!target) { throw new Error('No word/document.xml in this file'); }
                if (target.method !== 0 && target.method !== 8) {
                    throw new Error('Unsupported compression method ' + target.method);
                }
                var bytes = compressedBytes(buffer, target);
                var data = target.method === 0 ? Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) : inflateRaw(bytes);
                data.then(function (out) {
                    var xml = new TextDecoder('utf-8').decode(new Uint8Array(out));
                    resolve({ text: xmlToText(xml), paragraphs: xmlToText(xml).split('\n').length });
                }).catch(reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    window.EmploStartDocx = {
        extract: extract,
        extractFromXml: xmlToText
    };
})();
