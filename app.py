import os
import json
import requests
from flask import Flask, request
from twilio.twiml.messaging_response import MessagingResponse 

app = Flask(__name__)

#sms end point
@app.route('/sms', methods=['POST'])
def vocabulary():
    word_synonym = ""
    word_antonym = ""
    incoming_msg = request.values.get('Body', '').lower()
    resp = MessagingResponse()
    message = resp.message()
    responded = False
    words = incoming_msg.split('-')
    if len(words) == 1 and incoming_msg == "help":
        help_string = create_help_message()
        message.body(help_string)
        responded = True
    elif len(words) == 2:
        search_type = words[0].strip()
        input_string = words[1].strip().split()
        if len(input_string) == 1:
            response = get_dictionary_response(input_string[0])
            if search_type == "Meaning":
                message.body(response["meaning"])
                responded = True
            if search_type == "Synonyms":
                for synonym in response["synonyms"]:
                    word_synonym += synonym + "\n"
                message.body(word_synonym)
                responded = True
            if search_type == "Antonyms":
                for antonym in response["antonyms"]:
                    word_antonym += antonym + "\n"
                message.body(word_antonym)
                responded = True
            if search_type == "Examples":
                message.body(response["examples"])
                responded = True
    if not responded:
        message.body('Incorrect request format. Please enter help to see the correct format')
    return str(resp)


def create_help_message():
    help_message = "*Teaching BOT* ! \n\n" \
        "You can ask the bot the below listed things:  \n"\
        "*Meaning* - type the word \n"\
        "*Examples* - type the word \n"\
        "*Synonyms* - type the word \n"\
        "*Antonyms* - type the word \n"
    return help_message


def get_dictionary_response(word):
    word_metadata = {}
    definition = "sorry, no definition is available."
    example = "sorry, no examples are available."
    synonyms = ["sorry, no synonyms are available."]
    antonyms = ["sorry, no antonyms are available."]
    url = f"https://www.dictionaryapi.com/api/v3/references/thesaurus/json/"+word+"?key=d7959537-8c8a-41a8-b663-1e1e87b9a82b"
    response = requests.get(url)
    api_response = json.loads(response.text)
    if response.status_code == 200:
        for data in api_response:
            try:
                if data["meta"]["id"] == word:
                    try:
                        if len(data["meta"]["syns"]) != 0:
                            synonyms = data["meta"]["syns"][0]
                        if len(data["meta"]["ants"]) != 0:
                            antonyms = data["meta"]["ants"][0]
                        for results in data["def"][0]["sseq"][0][0][1]["dt"]:
                            if results[0] == "text":
                                definition = results[1]
                            if results[0] == "vis":
                                example = results[1][0]["t"].replace("{it}", "*").\
                                    replace("{/it}", "*")
                    except KeyError as e:
                        print(e)
            except TypeError as e:
                print(e)
            break
    word_metadata["meaning"] = definition
    word_metadata["examples"] = example
    word_metadata["antonyms"] = antonyms
    word_metadata["synonyms"] = synonyms
    return word_metadata


@app.route("/")
def home():
    return "<h1>Hello bot 🤖 !</h1>" #welcome message


if __name__ == "__main__":
    app.run(debug=True)
