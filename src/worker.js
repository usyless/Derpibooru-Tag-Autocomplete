'use strict';

let tags = [], pos = -1, length, comparator = 'includes', error = null;
const typeMap = {
    data: (data) => {
        parseCSV(data.data);
        length = tags.length;
        if (length === 0) error = 'No tags CSV loaded, go to settings and load one to use local autocomplete.';
    },
    query: (data) => {
        if (!error) {
            comparator = data.match_start ? 'startsWith' : 'includes';
            const query = data.query, query_length = query.length, result = [];
            if (data.newQuery) pos = -1;
            for (++pos; pos < length; ++pos) {
                const tuple = tags[pos];
                if (query_length <= tuple[0].length && tuple[0][comparator](query)) {
                    result.push({aliased_tag: null, name: tuple[0], images: tuple[2]});
                } else for (const a of tuple[1]) if (query_length <= a.length && a[comparator](query)) {
                    result.push({aliased_tag: tuple[0], name: a, images: tuple[2]});
                    break;
                }
                if (result.length >= 25) break;
            }
            postMessage(result);
        } else {
            postMessage({aliased_tag: null, name: error, images: -2});
        }
    }
}

onmessage = (e) => typeMap[e.data.type]?.(e.data);

class ParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ParseError';
    }
}
function parseCSV(csvString) {
    try {
        tags = []
        const push = tags.push.bind(tags), lines = csvString.split('\n'), ll = lines.length;
        for (let i = 0; i < ll; ++i) {
            const values = lines[i].split(',');

            if (values.length === 1 && values[0] === '') continue;
            else if (values.length >= 2) {
                const aliases = [];

                for (let i = 2; i < values.length; ++i) {
                    if (values[i] === "") break;
                    aliases.push(values[i].trim().toLowerCase().replaceAll('"', ""));
                }

                push([values[0].trim().toLowerCase(), aliases, values[1]]);
            } else {
                throw new ParseError(i.toString());
            }
        }
    } catch (e) {
        if (e instanceof ParseError) error = `Error parsing tags CSV at line ${Number(e.message) + 1}`;
        else `Error parsing tags CSV. Error message: ${e.message}`;
    }
}
