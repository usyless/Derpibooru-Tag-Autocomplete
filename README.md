<h1 align="center"><a href="#"><img src="https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/src/icons/icon.svg?raw=true" width="160" height="160" alt="logo"></a><br>Derpibooru Tag Autocomplete</h1>

An alternative tag autocompletion for derpibooru.org, using either a combination of local autocomplete and its API, or with a fully local autocomplete

## Use Instructions
- No setup required, just install the extension.
- Navigate the autofill column with the arrows keys, or mouse scroll.
- Press `tab` to fill the currently selected item, by default this will fill the first item.
- Currently supported search operators (will not interfere with search):
  - `,`, `AND`, `&&`, `OR`, `||`, `-`, `!`, `NOT`, `()`
- Supported autocomplete operators: `*` and `?`, which work as they do in the derpibooru search

## Settings
- Change match mode from any match in the search to just matching the start of the tags
- Toggle searching of special tags, such as score:, created_at:, etc.
- Displayed results count
- You can toggle the usage of API calls to fill results once the local autocomplete is exhausted

## Fully local autocomplete
- If you enable the local autocomplete you need to make sure to provide a valid tags file
- The tags file is a csv of format `{tag name},{tag count},"{tag aliases separated by commas inside quotes}"`
- Enabling this disables all api calls

## Install

<a href="https://addons.mozilla.org/en-GB/firefox/addon/derpibooru-tag-autocomplete/"><img src="https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/3rdparty/firefox-addons.webp?raw=true" alt="Firefox Addons Link"></a>


<a href="https://chromewebstore.google.com/detail/derpibooru-tag-autocomple/fhfmeekjjdpnnelbddcfmcgmadcgfefl"><img src="https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/3rdparty/chrome-web-store.png?raw=true" alt="Chrome Web Store Link"></a>


## Extension Images
### Desktop
![Derpibooru Tag Autocomplete desktop with blue theme](https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/desktop_blue.png?raw=true)
![Derpibooru Tag Autocomplete desktop with purple theme](https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/desktop_purple.png?raw=true)
### Mobile
![Derpibooru Tag Autocomplete mobile with purple theme](https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/mobile_purple.png?raw=true)
