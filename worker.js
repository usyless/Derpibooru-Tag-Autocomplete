'use strict';

let tags, pos = -1, length, comparator = 'includes';

const typeMap = {
    data: (data) => {
        tags = parseCSV(data.data);
        length = tags.length;
        comparator = data.match_start ? 'startsWith' : 'includes';
    },
    query: (data) => {
        if (length > 0) {
            const query = data.query, query_length = query.length, result = [];
            if (data.newQuery) pos = -1;
            for (++pos; pos < length; ++pos) {
                const tuple = tags[pos];
                if (query_length <= tuple[0].length && tuple[0][comparator](query)) {
                    result.push({aliased_tag: null, name: tuple[0], images: tuple[2]});
                }
                else for (const a of tuple[1]) if (query_length <= a.length && a[comparator](query)) {
                    result.push({aliased_tag: tuple[0], name: a, images: tuple[2]});
                    break;
                }
                if (result.length >= 25) break;
            }
            postMessage(result);
        }
    }
}

onmessage = (e) => typeMap[e.data.type]?.(e.data);

function parseCSV(csvString) {
    const rows = csvString.split('\n');
    const tuples = [];

    for (const row of rows) {
        const values = row.split(',');

        if (values.length >= 2) {
            const name = values[0].trim().toLowerCase(), aliases = [];

            for (let i = 2; i < values.length; i++) {
                if (values[i] === "") break;
                aliases.push(values[i].trim().toLowerCase().replaceAll('"', ""));
            }

            tuples.push([name, aliases, values[1]]);
        }
    }

    return tuples;
}
