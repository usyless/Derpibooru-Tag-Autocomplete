browser.runtime.onMessage.addListener(async (request) => {
    if (request.type === "tags") {
        const page = request['page'];
        let data = await fetch(`https://derpibooru.org/api/v1/json/search/tags?q=*${request['query']}*${page === 1 ? "" : `&page=${page}`}`, {method: "GET"});
        data = await data.json();
        return data['tags'];
    }
});