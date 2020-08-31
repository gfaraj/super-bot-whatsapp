# super-bot-whatsapp
This is a Whatsapp client for [super-bot](https://github.com/gfaraj/super-bot). It works on top of the Whatsapp Web application. The API is not public, so any changes made by Whatsapp could disrupt it at any time. 

The client relays messages to the bot service and sends back the bot's replies. It picks up messages that start with the "!" character as commands for the bot. It also has a couple of client-specific commands like "!screenshot" which takes a screenshot of only the current chat and sends it there, and "!moment " which takes the screenshot and also issues a "!record [name]" command to save the screenshot. The client supports sending images and custom stickers.

## Docker

You can run this app in a docker container by using:

```
docker run gfaraj/super-bot-whatsapp
```

You will need to specify a couple of environment variables so that the Whatsapp client knows where the [super-bot service](https://github.com/gfaraj/super-bot) is located:

```
docker run --env SUPERBOT_URL=http://MY_MACHINE:3000/message --env PUPPETEER_MODE=headless gfaraj/super-bot-whatsapp
```

The SUPERBOT_URL variable defaults to "http://localhost:3000/message" if not set. The PUPPETEER_MODE variable defaults to "normal" if not set, which will open a browser window with Whatsapp Web. You can also use the --env-file parameter if needed. The github repository also contains a couple of docker-compose files to aid in setting up a container for this app:

```
docker-compose up
```

The first time that you run the app, you should not specify PUPPETEER_MODE=headless because you'll want to authenticate the Whatsapp Web with your Whatsapp phone app. After logging in, you can close the browser and run it again with headless mode if you want to run it in the background.

## Installing from source

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
