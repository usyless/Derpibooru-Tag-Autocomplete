# Derpibooru Tag Autocomplete
Altertnative tag autocompletion for derpibooru.org, with infinite scroll, using the available API or using a local list of tags

## Use Instructions
- No setup required, just install the extension.
- Navigate the autofill column with the arrows keys, or mouse scroll.
- Press `tab` to fill the currently selected item, by default this will fill the first item.
- Currently supported search operators (will not interfere with search):
  - `,`, `AND`, `&&`, `OR`, `||`, `-`, `!`, `NOT`, `()`

## Settings
- Change match mode from any match in the search to just matching the start of the tags
- Toggle searching of special tags, such as score:, created_at:, etc.
- Displayed results count
- If you enable the local autocomplete you need to make sure to provide a valid tags file
- The tags file is a csv of format `{tag name},{tag count},"{tag aliases separated by commas inside quotes}"`

## Install
### Firefox Desktop/Mobile (or Fennec)
- Install extension through the [Mozilla addons page ](https://addons.mozilla.org/en-GB/firefox/addon/derpibooru-tag-autocomplete/)
### Chrome or other chromium based browsers
- Download chromium zip from the [latest release](https://github.com/usyless/Derpibooru-Tag-Autocomplete/releases/latest)
- Unzip the file into a known directory
- Visit chrome://extensions in your browser
- Enable developer mode (There should be a toggle present on the page)
- Press "Load Unpacked" or equivalent, select the unzipped folder

## Extension Images
### Desktop
![Derpibooru Tag Autocomplete desktop with blue theme](https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/desktop_blue.png?raw=true)
![Derpibooru Tag Autocomplete desktop with purple theme](https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/desktop_purple.png?raw=true)
### Mobile
![Derpibooru Tag Autocomplete mobile with purple theme](https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/mobile_purple.png?raw=true)
