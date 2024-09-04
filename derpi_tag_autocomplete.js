'use strict';

(() => {
    function autocomplete(input, ac_list) {
        let recievedPage = true, currentQuery = '', page = 1, controller = new AbortController(), timer;
        const createListItem = listItemTemplate();

        function addToInput(tag) {
            input.value = currentQuery.substring(0, currentQuery.length - cleanQuery(currentQuery).length) + tag;
        }

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
                if (aliased_tag) new_text_div.appendChild(document.createTextNode(` → ${aliased_tag}`));
                return newList;
            }
        }

        function addItemToAutocomplete(data, query) {
            const ac_item = createListItem(query, data['aliased_tag'], data['name'], data['images']);
            ac_item.addEventListener('click', (e) => {
                e.stopPropagation();
                addToInput(data['name']);
                input.dispatchEvent(new Event('input'));
                input.focus();
                clearTimeout(timer);
                closeList();
            });
            ac_list.appendChild(ac_item);
        }

        function displayAutocompleteResults(newQuery, query, data) {
            if (newQuery) closeList();
            if (data && data.length > 0) {
                recievedPage = true;
                for (const i of data) addItemToAutocomplete(i, query);
                if (newQuery) ac_list.firstElementChild.classList.add('ac-active');
            }
        }

        let cleanedQuery = '';
        async function getResults(newQuery) {
            recievedPage = false;
            if (newQuery) {
                cleanedQuery = cleanQuery(currentQuery);
                page = 1;
            } else ++page;
            cleanedQuery.length <= 0
                ? closeList()
                : displayAutocompleteResults(newQuery, cleanedQuery, (await (await fetch(`https://derpibooru.org/api/v1/json/search/tags?q=*${cleanedQuery}*&page=${page}`,
                    {method: "GET", signal: controller.signal})).json())['tags']);
        }

        input.addEventListener('input', () => {
            clearTimeout(timer);
            controller.abort();
            controller = new AbortController();
            currentQuery = input.value;
            if (currentQuery.length <= 0) closeList();
            timer = setTimeout(() => getResults(true), 250);
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
        }

        document.addEventListener('click', closeList);
    }

    let cleanQuery;
    {
        const searchOperators = [',', ' AND ', ' OR ', ' \\|\\| ', ' && '],
            regex = new RegExp(searchOperators.join('|'), 'g'), ignored = ['-', '!', 'NOT ', '('];

        function cleanQueryFunc(query) {
            query = query.trimStart().split(regex);
            query = query[query.length - 1].trimStart();
            if (query.length > 0) {
                for (const op of ignored) if (query.substring(0, op.length) === op) {
                    query = query.substring(op.length);
                    break;
                }
            }
            return query.trimStart().toLowerCase();
        }

        cleanQuery = cleanQueryFunc;
    }

    function simplifyNumber(number) {
        if (number < 1000) return number.toString();
        else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
        else return `${(number / 1000000).toFixed(1)}M`;
    }

    const inputs = [document.getElementById('q'), document.getElementById('searchform_q')];
    for (const input of inputs) {
        console.log(input);
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
})();