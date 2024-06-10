'use strict';

if (typeof browser === "undefined") {
    var browser = chrome;
}

(() => {
    function autocomplete(input, ac_list) {
        let focus = 0, recievedPage = true, lastQuery = '', page = 1;
        const createListItem = listItemTemplate();

        function addToInput(tag) {
            input.value = input.value.substring(0, input.value.length - lastQuery.length) + tag;
        }

        function listItemTemplate() {
            const list = document.createElement('li'),
                outer_div = document.createElement('div'),
                text_div = document.createElement('div'),
                number_div = document.createElement('div');
            text_div.classList.add('text-div');
            number_div.classList.add('number-div');
            outer_div.append(text_div, number_div);
            list.appendChild(outer_div);

            return (aliased_tag, name, count) => {
                number_div.innerText = simplifyNumber(count);
                const newList = list.cloneNode(true),
                    new_text_div = newList.firstChild.firstChild,
                    strong = document.createElement('strong'),
                    index = name.indexOf(lastQuery);
                strong.innerText = name.substring(index, index + lastQuery.length);
                new_text_div.append(document.createTextNode(name.substring(0, index)), strong, document.createTextNode(name.substring(index + lastQuery.length)));
                if (aliased_tag) new_text_div.appendChild(document.createTextNode(` → ${aliased_tag}`));
                return newList;
            }
        }

        function displayAutocompleteResults(data) {
            if (data.length > 0) {
                recievedPage = true;
                if (page === 1) closeList();
                for (const i of data) addItemToAutocomplete(i);
                if (page === 1 && ac_list.firstElementChild) ac_list.firstElementChild.classList.add('ac-active');
            }
        }

        function addItemToAutocomplete(data) {
            const ac_item = createListItem(data['aliased_tag'], data['name'], data['images']);
            ac_item.addEventListener('click', (e) => {
                e.stopPropagation();
                addToInput(data['name'], lastQuery.length);
                closeList();
                input.focus();
            });
            ac_list.appendChild(ac_item);
        }

        {
            let timer;
            input.addEventListener('input', async () => {
                if (timer) clearTimeout(timer);
                let query = input.value;
                const split = query.split(',');
                query = split[Math.max(0, split.length - 1)].trim();
                if (query !== lastQuery) {
                    if (query.length <= 0) {
                        closeList();
                        lastQuery = '';
                    }
                    else timer = setTimeout(() => getResults(query.toLowerCase()), 250);
                }
            });
        }

        async function getResults(query) {
            recievedPage = false;
            if (query) {
                lastQuery = query;
                focus = 0;
                page = 1;
            }
            else ++page;
            displayAutocompleteResults((await (await fetch(`https://derpibooru.org/api/v1/json/search/tags?q=*${lastQuery}*${page === 1 ? "" : `&page=${page}`}`, {method: "GET"})).json())['tags']);
        }

        input.addEventListener('keydown', (e) => {
            const items = ac_list.children;
            if (e.keyCode === 40) { // down
                e.preventDefault();
                changeActive(items, 1);
            } else if (e.keyCode === 38) { // up
                e.preventDefault();
                changeActive(items, -1);
            } else if (e.keyCode === 9) { // tab
                e.preventDefault();
                items[focus].click();
            }
        });

        function changeActive(items, effect) {
            const oldItem = items[focus];
            oldItem.classList.remove('ac-active');
            focus += effect;

            if (!recievedPage && focus >= items.length) focus = 0;
            else if (focus < 0) focus = items.length - 1;
            const newItem = items[focus];
            newItem.classList.add('ac-active');
            newItem.scrollIntoView({block: 'center'});
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
                    if (recievedPage && ac_list.scrollTop + ac_list.offsetHeight >= ac_list.scrollHeight - 648) getResults();
                });
            }
        }

        document.addEventListener('click', closeList);
    }

    function simplifyNumber(number) {
        if (number < 1000) return number.toString();
        else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
        else return `${(number / 1000000).toFixed(1)}M`;
    }

    const form = document.getElementById('q').parentElement,
        div = document.createElement('div');
    if (form) {
        div.classList.add('ac', ...form.classList);
        form.before(div);
        div.appendChild(form);

        const input = document.getElementById('q');
        input.autocomplete = 'off';

        const ac_list = document.createElement('div');
        ac_list.id = 'ac-list';
        ac_list.classList.add('ac-items');
        input.parentNode.parentNode.appendChild(ac_list);

        autocomplete(input, ac_list);
    } else console.warn('No search box found!');
})();