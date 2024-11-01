#include "emscripten.h"
#include <string>
#include <vector>
#include <algorithm>
#include <functional> 
#include <string.h>

using namespace std;

struct Tag {
    string name;
    string images;
    vector<string> aliases;
};

vector<Tag> Tags;
size_t tagsLength = 0;
int pos = -1;

// any match by default
function<bool(string, string)> comparator = [](const string& name, const string& query) { 
    return name.find(query) != string::npos; 
};

string autocomplete(const char* text, const bool newQuery) {
    string result = "[";
    size_t result_count = 0;
    if (tagsLength > 0) {
        string query(text);
        size_t queryLength = query.length();
        if (newQuery) pos = -1;
        for (++pos; pos < tagsLength; ++pos) {
            Tag tag = Tags[pos];
            if (queryLength <= tag.name.length() && comparator(tag.name, query)) { 
                result += "{\"name\":\"" + tag.name + "\",\"aliased_tag\":null,\"images\":\"" + tag.images + "\"},";
                ++result_count;
            } else { 
                for (const auto& alias : tag.aliases) { 
                    if (queryLength <= alias.length() && comparator(alias, query)) { 
                        result += "{\"name\":\"" + tag.name + "\",\"aliased_tag\":\"" + alias + "\",\"images\":\"" + tag.images + "\"},";
                        ++result_count;
                        break; 
                    } 
                } 
            }
            if (result_count >= 25) break;
        }
    }
    if (result.back() == ',') result = result.substr(0, result.length() - 1);
    result += "]";
    return result;
}

void loadCSV(const char* csv) {
    string csvString(csv);
    string row;
    vector<string> values;
    string value;
    size_t start = 0, end = 0;
    
    while ((end = csvString.find('\n', start)) != string::npos) {
        row = csvString.substr(start, end - start);
        start = end + 1;
        
        values.clear();
        size_t rowStart = 0, rowEnd = 0;
        while ((rowEnd = row.find(',', rowStart)) != string::npos) {
            values.emplace_back(row.substr(rowStart, rowEnd - rowStart));
            rowStart = rowEnd + 1;
        }
        values.emplace_back(row.substr(rowStart));
        
        if (values.size() >= 2) {
            Tag tag;
            tag.name = values[0];
            tag.images = values[1];
            transform(tag.name.begin(), tag.name.end(), tag.name.begin(), ::tolower);
            for (size_t i = 2; i < values.size(); ++i) {
                if (values[i].empty()) break;
                string alias = values[i];
                transform(alias.begin(), alias.end(), alias.begin(), ::tolower);
                alias.erase(remove(alias.begin(), alias.end(), '"'), alias.end());
                tag.aliases.emplace_back(alias);
            }
            Tags.emplace_back(tag);
        }
    }
    
    tagsLength = Tags.size();
}


inline const char* stringReturn(string str) {
    char* buffer = new char[str.size() + 1];
    strcpy(buffer, str.c_str());
    return buffer;
}

extern "C" {
    EMSCRIPTEN_KEEPALIVE void loadTags(const char* csvString, const int match_start) {
        loadCSV(csvString);
        if (match_start > 0) { // start match
            comparator = [](const string& name, const string& query) { 
                return name.rfind(query, 0) == 0;
            };
        } else { // any match
            comparator = [](const string& name, const string& query) { 
                return name.find(query) != string::npos;
            };
        }
    }

    EMSCRIPTEN_KEEPALIVE const char* complete(const char* text, const int newQuery) {
        return stringReturn(autocomplete(text, newQuery > 0));
    }

    EMSCRIPTEN_KEEPALIVE void delete_return_string(char* ptr) {
        delete[] ptr;
    }
}
