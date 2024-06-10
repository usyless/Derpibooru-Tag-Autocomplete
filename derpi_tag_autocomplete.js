'use strict';

(() => {
    function autocomplete(input, ac_list) {
        let focus = 0, recievedPage = true, lastQuery = '', page = 1, timer, controller = new AbortController();
        const createListItem = listItemTemplate(),
            keyMappings = {
                40: () => changeActive(true),
                38: () => changeActive(false),
                9: () => document.querySelector('[class*="ac-active"]').click()
            };

        function addToInput(tag) {
            input.value = input.value.substring(0, input.value.length - lastQuery.length) + tag;
        }

        function listItemTemplate() {
            const list = document.createElement('li'), outer_div = document.createElement('div'),
                text_div = document.createElement('div'), number_div = document.createElement('div');
            text_div.classList.add('text-div');
            number_div.classList.add('number-div');
            outer_div.append(text_div, number_div);
            list.appendChild(outer_div);

            return (aliased_tag, name, count) => {
                number_div.innerText = simplifyNumber(count);
                const newList = list.cloneNode(true), index = name.indexOf(lastQuery),
                    new_text_div = newList.firstChild.firstChild,
                    strong = document.createElement('strong');
                strong.innerText = name.substring(index, index + lastQuery.length);
                new_text_div.append(document.createTextNode(name.substring(0, index)), strong, document.createTextNode(name.substring(index + lastQuery.length)));
                if (aliased_tag) new_text_div.appendChild(document.createTextNode(` → ${aliased_tag}`));
                return newList;
            }
        }

        function addItemToAutocomplete(data) {
            const ac_item = createListItem(data['aliased_tag'], data['name'], data['images']);
            ac_item.addEventListener('click', (e) => {
                e.stopPropagation();
                addToInput(data['name']);
                closeList();
                input.focus();
            });
            ac_list.appendChild(ac_item);
        }

        function displayAutocompleteResults(newQuery, data) {
            if (newQuery) closeList();
            if (data.length > 0) {
                recievedPage = true;
                for (const i of data) addItemToAutocomplete(i);
                if (newQuery) ac_list.firstElementChild.classList.add('ac-active');
            }
        }

        async function getResults(newQuery) {
            recievedPage = false;
            if (newQuery) {
                focus = 0;
                page = 1;
            } else ++page;
            try {
                displayAutocompleteResults(newQuery, (await (await fetch(`https://derpibooru.org/api/v1/json/search/tags?q=*${lastQuery}*&page=${page}`, {
                    method: "GET",
                    signal: controller.signal
                })).json())['tags']);
            } catch {}
        }

        input.addEventListener('input', () => {
            clearTimeout(timer);
            const query = cleanQuery(input.value);
            controller.abort();
            controller = new AbortController();
            if (query !== lastQuery) {
                lastQuery = query;
                if (query.length <= 0) closeList();
                else timer = setTimeout(() => getResults(true), 250);
            }
        });

        input.addEventListener('click', (e) => e.stopPropagation());

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

        input.addEventListener('keydown', (e) => {
            const action = keyMappings[e.keyCode];
            if (action) {
                e.preventDefault();
                action();
            }
        });

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
        }

        document.addEventListener('click', closeList);
    }

    function getCleanQuery() { // add checking for escape character later, or double quotes, seems complex
        const searchOperators = [',', ' AND ', ' OR ', ' \\|\\| ', ' && '],
            regex = new RegExp(searchOperators.join('|'), 'g'), notOperators = ['-', '!', 'NOT '];

        return (query) => {
            query = query.trimStart().split(regex);
            query = query[query.length - 1].trimStart();
            if (query.length > 0) {
                for (const op of notOperators) if (query.substring(0, op.length) === op) {
                    query = query.substring(op.length);
                    break;
                }
            }
            return query.trimStart().toLowerCase();
        }
    }

    const cleanQuery = getCleanQuery();

    function simplifyNumber(number) {
        if (number < 1000) return number.toString();
        else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
        else return `${(number / 1000000).toFixed(1)}M`;
    }

    const input = document.getElementById('q'), form = input.parentElement, div = document.createElement('div'),
        ac_list = document.createElement('div');
    if (form) {
        div.classList.add('ac', ...form.classList);
        form.before(div);
        div.appendChild(form);

        input.autocomplete = 'off';

        ac_list.classList.add('ac-list');
        input.parentNode.parentNode.appendChild(ac_list);

        autocomplete(input, ac_list);
    } else console.warn('No search box found!');
})();