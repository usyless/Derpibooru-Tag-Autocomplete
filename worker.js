'use strict';

let tags, pos = -1, q = "", length;

// Result format: [beforeText, bold, afterText, alias, actual, number]

onmessage = (e) => {
    if (e.data[0] === 0) {
        if (length > 0) {
            const query = e.data[1], result = [];
            if (query) {
                pos = -1;
                q = query;
            }
            for (pos++; pos < length; pos++) {
                const r = inNameOrAlias(tags[pos], q);
                if (r[0]) result.push([r[1], r[2], r[3], r[4], tags[pos][0], tags[pos][2]]);
                if (result.length >= 25) break;
            }
            postMessage([q, result, !(query == null), pos >= length]);
        }
    } else {
        tags = parseCSV(e.data[1]);
        length = tags.length;
    }
};

// Return format: [success, beforeText, bold, afterText, alias]
function inNameOrAlias(tuple, query) {
    let alias, index = -1;
    if (query.length <= tuple[0].length) index = tuple[0].indexOf(query);
    if (index === -1) {
        for (const a of tuple[1]) {
            if (query.length <= a.length) {
                index = a.indexOf(query);
                if (index !== -1) {
                    alias = a;
                    break;
                }
            }
        }
    }
    if (index === -1) return [false];
    else {
        let str;
        if (alias) str = alias;
        else str = tuple[0];
        return [true, str.substring(0, index), str.substring(index, index + query.length),
            str.substring(index + query.length), !(alias == null)];
    }
}

function parseCSV(csvString) {
    const rows = csvString.split('\n');
    const tuples = [];

    rows.forEach(row => {
        const values = row.split(',');

        if (values.length >= 2) {
            const name = values[0].trim().toLowerCase(), aliases = [];

            for (let i = 2; i < values.length; i++) {
                if (values[i] === "") break;
                aliases.push(values[i].trim().toLowerCase().replaceAll('"', ""));
            }

            tuples.push([name, aliases, values[1]]);
        }
    })

    return tuples;
}
