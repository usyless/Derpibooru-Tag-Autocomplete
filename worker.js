let maxTags, tags, pos = 0, q, first = true;

onmessage = (e) => {
    if(e.data.length === 2) {
        tags = parseCSV(e.data[0]);
        maxTags = e.data[1];
    }
    else {
        const query = e.data[0];
        if (q && q !== query) {
            first = true;
            pos = 0;
        }
        q = query;
        const result = [];

        if (tags.length > 0) {
            for (let i = pos; i < tags.length; i++) {
                let [index, alias] = inNameOrAlias(tags[i], query);
                if (index >= 0) {
                    result.push([index, alias, tags[i][0], tags[i][2]]);
                }
                pos = i + 1;
                if (result.length >= maxTags) break;
            }
        }
        postMessage([query, result, first, pos >= tags.length]);
        first = false;
    }
};

function inNameOrAlias(tuple, query) {
    let alias = "";
    let index = -1;
    if (query.length <= tuple[0].length) index = tuple[0].indexOf(query);
    if (index === -1) {
        for (let a of tuple[1]) {
            if (query.length <= a.length) {
                index = a.indexOf(query);
                if (index !== -1) {
                    alias = a;
                    break;
                }
            }
        }
    }
    return [index, alias];
}

function parseCSV(csvString) {
    const rows = csvString.split('\n');
    const tuples = [];

    rows.forEach(row => {
        const values = row.split(',');

        if (values.length >= 2) {
            let name = values[0].trim().toLowerCase();
            let aliases = [];

            for (let i = 2; i < values.length; i++) {
                if (values[i] === "") break;
                aliases.push(values[i].trim().toLowerCase().replaceAll('"', ""));
            }

            tuples.push([name, aliases, values[1]]);
        }
    })

    return tuples;
}
