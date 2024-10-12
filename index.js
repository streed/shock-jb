const { Client, GatewayIntentBits, messageLink } = require('discord.js');
const axios = require('axios')

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const ALLOWED = process.env.ALLOWED ? process.env.ALLOWED.split(',') : []

const STATS = {}
const TOTAL_ZAPS = 0
const TOTAL_VIBES = 0

client.on('ready', () => {
 console.log(`Logged in as ${client.user.tag}!`);
});

async function sendStimulus(type, value, reason) {
    const options = {
    method: 'POST',
    url: 'https://api.pavlok.com/api/v5/stimulus/send',
    headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        Authorization: process.env.API_TOKEN
    },
    data: {stimulus: {stimulusType: type, stimulusValue: value, reason: reason}}
    };

    axios
    .request(options)
    .catch(function (error) {
        console.error(error);
    });
}

client.on('messageCreate', async msg => {
    const user = msg.author.globalName

    console.log(user)

    if (ALLOWED.indexOf(user) < 0) {
        return
    } else {
        console.log(`User ${user} is allowed.`)
    }

    if (msg.content === '!vibe') {
        await sendStimulus('vibe', 15, 'Vibe Check!')
        await msg.react('🍊')
        TOTAL_VIBES++
        STATS[user]++
    }

    if(msg.content === '!shock') {
        await sendStimulus('zap', 15, 'Shock Check!')
        await msg.react('🍇')
        TOTAL_ZAPS++
        STATS[user]++
    }

    if (msg.content == '!stats') {
        client.channels.cache.get(msg.channelId).send(`Total shocks: ${TOTAL_ZAPS} and Total Vibes: ${TOTAL_VIBES} since last deploy.`)
    }
})

// Log In our bot
client.login(process.env.DISCORD);
