from flask import Flask, request

app = Flask(__name__)


@app.route("/")
def home():
    return "<h1>Hello whatsapp2 bot</h1>"


if __name__ == "__main__":
    app.run(debug=True)