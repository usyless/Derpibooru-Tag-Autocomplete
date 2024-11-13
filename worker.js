'use strict';

let tags = [], pos = -1, length, comparator = 'includes';

const special_searches = [
    'created_at:', 'aspect_ratio:', 'comment_count:', 'created_at:', 'description:', 'downvotes:', 'faved_by:',
    'faves:', 'height:', 'id:', 'mime_type:', 'orig_sha512_hash:', 'original_format:', 'score:', 'sha512_hash:',
    'source_count:', 'source_url:', 'tag_count:', 'uploader:', 'upvotes:', 'width:', 'wilson_score:'
]

const typeMap = {
    data: (data) => {
        parseCSV(data.data);
        length = tags.length;
        comparator = data.match_start ? 'startsWith' : 'includes';
    },
    query: (data) => {
        if (length > 0) {
            const query = data.query, query_length = query.length, result = [];
            if (data.newQuery) {
                pos = -1;
                for (const special of special_searches) if (special.startsWith(query)) {
                    result.push({aliased_tag: null, name: special, images: -1})
                }
            }
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
    tags = []
    const push = tags.push.bind(tags);
    for (const row of csvString.split('\n')) {
        const values = row.split(',');

        if (values.length >= 2) {
            const aliases = [];

            for (let i = 2; i < values.length; ++i) {
                if (values[i] === "") break;
                aliases.push(values[i].trim().toLowerCase().replaceAll('"', ""));
            }

            push([values[0].trim().toLowerCase(), aliases, values[1]]);
        }
    }
}
