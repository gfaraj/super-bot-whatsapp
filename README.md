# super-bot-whatsapp
This is a Whatsapp client for [super-bot](https://github.com/gfaraj/super-bot). It works on top of the Whatsapp Web application. The API is not public, so any changes made by Whatsapp could disrupt it at any time. 

The client relays messages to the bot service and sends back the bot's replies. It picks up messages that start with the "!" character as commands for the bot. It also has a couple of client-specific commands like "!screenshot" which takes a screenshot of only the current chat and sends it there, and "!moment " which takes the screenshot and also issues a "!record [name]" command to save the screenshot. The client supports sending images and custom stickers.

## Installing the bot client

Clone this repository:

```
git clone https://github.com/gfaraj/super-bot-whatsapp.git
```

and install its dependencies by running:

```
npm install
```

Make sure you have npm and Node 10 or newer installed.

## Starting the bot

You can run the Whatsapp client with the following command:

```
npm run start
```

This will open a browser window using puppeteer and will allow you to login into Whatsapp Web. While active, the bot will listen to new messages that are received by the account used to login.

## Configuration

The client uses a JSON configuration file located in the ./config folder. See the [config](https://docs.npmjs.com/cli/config) package documentation for more information.

# Disclaimer

This project was done for educational purposes. This code is in no way affiliated with, authorized, maintained, sponsored or endorsed by WhatsApp or any of its affiliates or subsidiaries. This is an independent and unofficial software. Use at your own risk.
