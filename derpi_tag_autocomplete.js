'use strict';

(async () => {
    const Settings = await getSettings();

    function autocomplete(input, ac_list) {
        let recievedPage = true, currentQuery = '', page = 1, controller = new AbortController(), timer;
        const createListItem = listItemTemplate();

        function listItemTemplate() {
            const list = document.createElement('li'), outer_div = document.createElement('div'),
                text_div = document.createElement('div'), number_div = document.createElement('div');
            text_div.classList.add('text-div');
            number_div.classList.add('number-div');
            outer_div.append(text_div, number_div);
            list.appendChild(outer_div);

            return (query, aliased_tag, name, count) => {
                number_div.innerText = simplifyNumber(count);
                const newList = list.cloneNode(true), index = name.indexOf(query),
                    new_text_div = newList.firstChild.firstChild,
                    strong = document.createElement('strong'), endIndex = index + query.length;
                if (index === -1) new_text_div.appendChild(document.createTextNode(name));
                else {
                    strong.innerText = name.substring(index, endIndex);
                    new_text_div.append(document.createTextNode(name.substring(0, index)), strong, document.createTextNode(name.substring(endIndex)));
                }
                if (aliased_tag) {
                    new_text_div.appendChild(document.createTextNode(` → ${aliased_tag}`));
                    newList.dataset.name = aliased_tag;
                } else newList.dataset.name = name;
                return newList;
            }
        }

        function displayAutocompleteResults(newQuery, query, data) {
            if (newQuery) closeList();
            if (data && data.length > 0) {
                recievedPage = true;
                for (const i of data) ac_list.appendChild(createListItem(query.current, i['aliased_tag'], i['name'], i['images']));
                ac_list.dataset.query = JSON.stringify(query);
                if (newQuery) ac_list.firstElementChild.classList.add('ac-active');
            }
        }

        async function getResults(newQuery) {
            recievedPage = false;
            if (newQuery) {
                page = 1;
            } else ++page;
            const q = JSON.parse(JSON.stringify(currentQuery));
            q.current.length <= 0
                ? closeList()
                : displayAutocompleteResults(newQuery, q, await fetchfunc(q.current, page, controller));
        }

        input.addEventListener('input', () => {
            clearTimeout(timer);
            controller.abort();
            controller = new AbortController();
            currentQuery = cleanQuery(input.value, input.selectionStart);
            if (currentQuery.current.length <= 0) closeList();
            else timer = setTimeout(() => getResults(true), 250);
        });

        input.addEventListener('click', (e) => e.stopPropagation()); // Prevent closing list

        { // Mapping Keys to their functions
            const keyMappings = {
                40: () => changeActive(true), // up
                38: () => changeActive(false), // down
                9: () => document.querySelector('[class*="ac-active"]').click() // tab
            };

            input.addEventListener('keydown', (e) => {
                const action = keyMappings[e.keyCode];
                if (action) {
                    e.preventDefault();
                    action();
                }
            });

            function changeActive(down) {
                const oldItem = document.querySelector('[class*="ac-active"]');
                oldItem.classList.remove('ac-active');

                let newItem = down ? oldItem.nextElementSibling : oldItem.previousElementSibling;
                if (!newItem) {
                    if (!recievedPage && down) newItem = ac_list.firstElementChild;
                    else if (!down) newItem = ac_list.lastElementChild;
                }
                newItem.classList.add('ac-active');
                newItem.scrollIntoView({block: 'center'});
            }
        }

        function closeList() {
            const newList = ac_list.cloneNode();
            ac_list.parentNode.replaceChild(newList, ac_list);
            ac_list = newList;
            { // scroll stuff
                let lastScrollTop = 0;
                ac_list.addEventListener('scroll', () => {
                    if (ac_list.scrollTop < lastScrollTop) return;
                    lastScrollTop = ac_list.scrollTop <= 0 ? 0 : ac_list.scrollTop;
                    if (recievedPage && ac_list.scrollTop + ac_list.offsetHeight >= ac_list.scrollHeight - 432) getResults(false);
                }, {signal: controller.signal});
            }
            { // input stuff
                ac_list.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const query = JSON.parse(ac_list.dataset.query), parts = query.parts, splitters = query.splitters;
                    parts[query.i] = e.target.closest("li").dataset.name;
                    input.value = "";
                    for (let i = 0; i < parts.length; ++i) {
                        input.value += parts[i] + (splitters?.[i] ?? '');
                    }
                    input.setSelectionRange(input.value.length, input.value.length);

                    input.dispatchEvent(new Event('input'));
                    input.focus();
                    clearTimeout(timer);
                    closeList();
                });
            }
        }

        document.addEventListener('click', closeList);
    }

    let cleanQuery;
    {
        const searchOperators = [',', ' AND ', ' OR ', ' \\|\\| ', ' && '],
            regex = new RegExp(searchOperators.join('|'), 'g'), ignored = ['-', '!', 'NOT ', '('];

        cleanQuery = (query, position) => {
            const parts = query.split(regex);
            const splitters = query.match(regex);

            let lengthCounter = 0, i = 0;
            for (const part of parts) {
                if (lengthCounter <= position && position <= lengthCounter + part.length) {
                    query = part.trimStart();
                    break;
                }
                lengthCounter += part.length + (splitters?.[i]?.length ?? 0);
                ++i;
            }

            if (query.length > 0) {
                for (const op of ignored) if (query.substring(0, op.length) === op) {
                    query = query.substring(op.length);
                    break;
                }
            }
            return {current: query.trimStart().toLowerCase(), parts, splitters, i};
        };
    }

    function simplifyNumber(number) {
        if (number < 1000) return number.toString();
        else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
        else return `${(number / 1000000).toFixed(1)}M`;
    }

    let fetchfunc;
    updateFetchFunc();
    function updateFetchFunc() {
        fetchfunc = Settings.preferences.match_start
            ? async (query, page, controller) => {
                return (await (await fetch(`https://derpibooru.org/api/v1/json/search/tags?q=${query}*&page=${page}`,
                            {method: "GET", signal: controller.signal})).json())['tags']
            }
            : async (query, page, controller) => {
                return (await (await fetch(`https://derpibooru.org/api/v1/json/search/tags?q=*${query}*&page=${page}`,
                            {method: "GET", signal: controller.signal})).json())['tags']
            }
    }

    const inputs = [document.getElementById('q'), document.getElementById('searchform_q')];
    for (const input of inputs) {
        if (input != null) {
            const form = input.parentElement, div = document.createElement('div'),
                ac_list = document.createElement('div');
            if (form) {
                div.classList.add('ac', ...form.classList);
                form.before(div);
                div.appendChild(form);

                input.autocomplete = 'off';

                ac_list.classList.add('ac-list');
                input.parentNode.parentNode.appendChild(ac_list);

                autocomplete(input, ac_list);
            }
        }
    }

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'local') for (const key in changes) {
            if (Settings.preferences.hasOwnProperty(key)) {
                await Settings.loadSettings();
                updateFetchFunc();
                return;
            }
        }
    });

    async function getSettings() { // Setting handling
        class Settings {
            preferences = {
                match_start: false,
            }

            async loadSettings() {
                const data = await chrome.storage.local.get(), settings = ['preferences'];
                for (const setting of settings) for (const s in this[setting]) this[setting][s] = data[s] ?? this[setting][s];
            }
        }

        const set = new Settings();
        await set.loadSettings();
        return set;
    }
})();