'use strict';

(async () => {
    const DEFAULT_TIMEOUT = 200;
    const scrollEvent = new Event('scroll'), inputEvent = new Event('input');
    let fetchfunc, timeout = DEFAULT_TIMEOUT, worker, cleanQuery;

    const special_searches = [
        'created_at:', 'aspect_ratio:', 'comment_count:', 'description:', 'downvotes:', 'faved_by:',
        'faves:', 'height:', 'id:', 'mime_type:', 'orig_sha512_hash:', 'original_format:', 'score:', 'sha512_hash:',
        'source_count:', 'source_url:', 'tag_count:', 'uploader:', 'upvotes:', 'width:', 'wilson_score:'
    ]

    const Settings = { // Setting handling
        preferences: {
            match_start: false,
            special_searches: true,
            results_visible: 6,
            local_autocomplete_enabled: false,
        },

        loadSettings: () => new Promise(resolve => {
            chrome.storage.local.get(['preferences'], (s) => {
                for (const setting of ['preferences']) Settings[setting] = {...Settings[setting], ...s[setting]};
                resolve();
            });
        }),
    }

    function autocomplete(input, ac_list) {
        let recievedPage = true, currentQuery, page = 1, controller = new AbortController(), timer;
        const createListItem = listItemTemplate();

        function listItemTemplate() {
            const list = document.createElement('li'), outer_div = document.createElement('div'),
                text_div = document.createElement('div'), number_div = document.createElement('div');
            text_div.classList.add('text-div');
            number_div.classList.add('number-div');
            outer_div.append(text_div, number_div);
            list.appendChild(outer_div);

            return (query, aliased_tag, name, count) => {
                number_div.textContent = simplifyNumber(count);
                const newList = list.cloneNode(true), index = name.indexOf(query),
                    new_text_div = newList.firstChild.firstChild,
                    strong = document.createElement('strong'), endIndex = index + query.length;
                if (index === -1) new_text_div.appendChild(document.createTextNode(name));
                else {
                    strong.textContent = name.substring(index, endIndex);
                    new_text_div.append(document.createTextNode(name.substring(0, index)), strong, document.createTextNode(name.substring(endIndex)));
                }
                if (aliased_tag) {
                    new_text_div.appendChild(document.createTextNode(` → ${aliased_tag}`));
                    newList.dataset.name = aliased_tag;
                } else newList.dataset.name = name;
                return newList;
            }
        }

        function displayAutocompleteResults(newQuery, data) {
            if (newQuery) {
                closeList(false);
                document.addEventListener('click', closeList, {once: true});
                ac_list.dataset.query = JSON.stringify(currentQuery);
            }
            if (data != null && data.length > 0) {
                recievedPage = true;
                ac_list.classList.remove('hidden');
                const curr = currentQuery.current;
                for (const i of data) ac_list.appendChild(createListItem(curr, i['aliased_tag'], i['name'], i['images']));
                if (newQuery) {
                    ac_list.firstElementChild.classList.add('ac-active');
                    ac_list.firstElementChild.scrollIntoView({behavior: 'instant', block: 'center'});
                }
                ac_list.dispatchEvent(scrollEvent);
            }
        }

        async function getResults(newQuery) {
            recievedPage = false;
            const curr = currentQuery.current, specials = [];
            if (newQuery) {
                page = 1;
                if (Settings.preferences.special_searches) {
                    for (const special of special_searches) if (special.startsWith(curr)) {
                        specials.push({aliased_tag: null, name: special, images: -1});
                    }
                }
            } else ++page;
            displayAutocompleteResults(newQuery, specials.concat(await fetchfunc(curr, page, controller)));
        }

        input.addEventListener('focus', async () => {
            if (Settings.preferences.local_autocomplete_enabled && !worker) {
                worker = new Worker(chrome.runtime.getURL("worker.js"));
                worker.postMessage({type: 'data', data: await Settings.getTags(), match_start: Settings.preferences.match_start});
            }
        });

        input.addEventListener('input', newSearch);
        input.addEventListener('pointerup', newSearch);

        function newSearch() {
            input.autocomplete = 'off';
            const newQuery = cleanQuery(input.value, input.selectionStart);
            if (newQuery.current !== currentQuery?.current) {
                clearTimeout(timer);
                if (!controller.signal.aborted) controller.abort();
                controller = new AbortController();
                currentQuery = newQuery;
                if (currentQuery.current.length <= 0) closeList();
                else timer = setTimeout(getResults, timeout, true);
            }
        }

        input.addEventListener('click', (e) => e.stopPropagation()); // Prevent closing list

        { // Mapping Keys to their functions
            const keyMappings = {
                'ArrowDown' : () => changeActive(true),
                'ArrowUp' : () => changeActive(false),
                'Tab' : () => ac_list.querySelector('.ac-active').click()
            };

            input.addEventListener('keydown', (e) => {
                const action = keyMappings[e.key];
                if (action) {
                    e.preventDefault();
                    action();
                }
            });

            function changeActive(down) {
                const oldItem = ac_list.querySelector('.ac-active');
                oldItem.classList.remove('ac-active');

                const newItem = down ? oldItem.nextElementSibling ?? ac_list.firstElementChild
                    : oldItem.previousElementSibling ?? ac_list.lastElementChild;
                newItem.classList.add('ac-active');
                newItem.scrollIntoView({block: 'center'});
            }
        }

        function closeList(full = true) {
            document.removeEventListener('click', closeList);
            if (full) currentQuery = null;
            ac_list.classList.add('hidden');
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

                    const selected = e.target.closest("li");
                    if (selected) {
                        const {parts, splitters, i, ignoredPrefix, uncleaned, lengthCounter} = JSON.parse(ac_list.dataset.query);
                        parts[i] = parts[i].replace(uncleaned, selected.dataset.name);
                        input.value = "";
                        for (let i = 0; i < parts.length; ++i) input.value += parts[i] + (splitters?.[i] ?? '');
                        input.setSelectionRange(lengthCounter + parts[i].length, lengthCounter + parts[i].length);

                        input.dispatchEvent(inputEvent);
                        input.focus();
                        clearTimeout(timer);
                        closeList();
                    }
                });
            }
        }
    }

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

            let ignoredPrefix = '';
            if (query.length > 0) {
                for (const op of ignored) if (query.startsWith(op)) {
                    ignoredPrefix = op;
                    query = query.substring(op.length);
                    break;
                }
            }
            return {current: query.trimStart().toLowerCase(), parts, splitters, i, ignoredPrefix, lengthCounter, uncleaned: query.trimStart()};
        };
    }

    function simplifyNumber(number) {
        if (number === -2) return 'error';
        else if (number === -1) return 'special';
        else if (number < 1000) return number.toString();
        else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
        else return `${(number / 1000000).toFixed(1)}M`;
    }

    updateFetchFunc();
    function updateFetchFunc() {
        worker?.terminate?.();
        worker = null;
        if (Settings.preferences.local_autocomplete_enabled) {
            timeout = 0;
            fetchfunc = (query, page, controller) => new Promise((resolve, reject) => {
                if (worker) {
                    worker.onmessage = (d) => {
                        if (controller.signal.aborted) reject('Autocomplete Cancelled');
                        resolve(d.data);
                    }
                    worker.postMessage({type: 'query', query: query, newQuery: page === 1});
                }
            });
        } else {
            timeout = DEFAULT_TIMEOUT;
            fetchfunc = async (query, page, controller) => {
                return (await (await fetch(`https://derpibooru.org/api/v1/json/search/tags?q=${Settings.preferences.match_start ? '' : '*'}${encodeURIComponent(query)}*&page=${page}`,
                            {method: "GET", signal: controller.signal})).json())['tags']
            }
        }
    }

    const updateListLengths = () => {
        const v = Number(Settings.preferences.results_visible);
        for (const list of document.querySelectorAll('.ac-list')) list.style.setProperty('--count', v);
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

                input.removeAttribute('data-ac');
                input.autocomplete = 'off';

                ac_list.classList.add('ac-list', 'hidden');
                input.parentNode.parentNode.appendChild(ac_list);

                autocomplete(input, ac_list);
            }
        }
    }
    updateListLengths();

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'local') {
            if (changes.hasOwnProperty('preference')) {
                Settings.loadSettings().then(() => {
                    updateFetchFunc();
                    updateListLengths();
                });
            }
        }
    });
})();