/* ---
Super-bot new message handler.
*/

const timeout = ms => new Promise(res => setTimeout(res, ms));

window.getFileHash = async (data) => {
    let buffer = await data.arrayBuffer();
    var sha = new jsSHA("SHA-256", "ARRAYBUFFER");
    sha.update(buffer);
    return sha.getHash("B64");
};

const getImageUrl = (o) => o.clientUrl || o.deprecatedMms3Url;

function processMessage(message) {
    window.onMessageReceived({
        sender : {
            id : message.sender.id._serialized,
            userId : message.sender.id.user,
            name : message.sender.formattedName,
            shortName: message.sender.shortName,
            isMe : message.sender.isMe
        },
        chat : {
            id : message.chat.id._serialized,
            chatId : message.chat.id.user,
            isGroup : message.chat.isGroup
        },
        type : message.type,
        mimeType : message.mimetype,
        body : message.body,
        text : message.type === 'chat' ? message.body : message.caption,
        isGroupMsg : message.isGroupMsg,
        quotedMsg : {
            caption : message.quotedMsgObj && message.quotedMsgObj.caption,
            body : message.quotedMsgObj && message.quotedMsgObj.body,
            type : message.quotedMsgObj && message.quotedMsgObj.type,
            mimeType : message.quotedMsgObj && message.quotedMsgObj.mimetype,
            mediaKey : message.quotedMsgObj && message.quotedMsgObj.mediaKey,
            url : message.quotedMsgObj && getImageUrl(message.quotedMsgObj),
            filehash : message.quotedMsgObj && message.quotedMsgObj.filehash,
            uploadhash : message.quotedMsgObj && message.quotedMsgObj.uploadhash,
            senderId : message.quotedMsgObj && message.quotedMsgObj.sender.id._serialized
        }
    });
}

function handleQuotedImage(message) {
    console.log("Processing a quoted image message...");

    const chat = Store.Chat.get(message.chat.id._serialized);
    if (!chat) {
        console.log(`Could not find chat: ${message.chat.id._serialized}`);
        return;
    }

    Store.UiController.openChatBottom(chat);

    let maxWaitCount = 10;
    let isProcessing = false;
    const imageWaitInterval = setInterval(async function() {
        if (maxWaitCount <= 0) {
            console.log("Could not resolve the quoted image, tried the maximum number of times.");
            clearInterval(imageWaitInterval);
            return;
        } else if (isProcessing) {
            console.log("Still processing last interval, exiting...");
            return;
        }

        try {
            maxWaitCount--;
            isProcessing = true;

            const quotedMessage = WAPI.getMessageById(message.quotedMsgObj.id);
            console.log(quotedMessage);

            if (quotedMessage && quotedMessage.mediaData.mediaStage === 'RESOLVED') {
                console.log("Quoted media resolved, checking...");
                
                if (quotedMessage.mediaData.mediaBlob) {
                    console.log("We have the data, processing message...");
                    clearInterval(imageWaitInterval);

                    const data = await window.WAPI.fileToBase64(quotedMessage.mediaData.mediaBlob._blob);
                    const originalMessage = WAPI.getMessageById(message.id);
                    originalMessage.quotedMsgObj.body = data;
                    processMessage(originalMessage);
                } else if (getImageUrl(quotedMessage) && quotedMessage.mediaKey && quotedMessage.mimetype) {
                    console.log("We don't have the data, downloading from client URL...");
                    clearInterval(imageWaitInterval);

                    const data = await window.WAPI.downloadFileAndDecrypt({
                        url: getImageUrl(quotedMessage), type: quotedMessage.type, mediaKey: quotedMessage.mediaKey, mimetype: quotedMessage.mimetype 
                    });
                    console.log("Download successful, processing message...");

                    const originalMessage = WAPI.getMessageById(message.id);
                    originalMessage.quotedMsgObj.body = data.result;
                    processMessage(originalMessage);
                }
            } else if (quotedMessage && quotedMessage.mediaData.mediaStage === 'NEED_POKE') {
                const rawQuotedMessage = Store.Msg.get(message.quotedMsgObj.id);
                if (rawQuotedMessage) {
                    maxWaitCount += 5;
                    rawQuotedMessage.downloadMedia(true, 1);
                }
            }
            else {
                console.log("Couldn't find quoted message, loading earlier messages...");

                await chat.loadEarlierMsgs();
                await chat.loadEarlierMsgs();
                await chat.loadEarlierMsgs();

                console.log("Loaded a few earlier messages, checking data...");

                const rawQuotedMessage = Store.Msg.get(message.quotedMsgObj.id);
                if (rawQuotedMessage) {
                    if (rawQuotedMessage.mediaData.mediaStage == 'NEED_POKE') {
                        maxWaitCount += 5;
                        rawQuotedMessage.downloadMedia(true, 1);
                    } else if (getImageUrl(rawQuotedMessage) && rawQuotedMessage.mediaKey && rawQuotedMessage.mimetype) {
                        console.log("Downloading quoted media...");
                        clearInterval(imageWaitInterval);

                        const data = await window.WAPI.downloadFileAndDecrypt({
                            url: getImageUrl(rawQuotedMessage), type: rawQuotedMessage.type, mediaKey: rawQuotedMessage.mediaKey, mimetype: rawQuotedMessage.mimetype 
                        });

                        console.log("Download successful, processing message...");

                        const originalMessage = WAPI.getMessageById(message.id);
                        originalMessage.quotedMsgObj.body = data.result;
                        processMessage(originalMessage);
                    }
                }
            }        
        } catch (err) {
            console.log('Could not retrieve data for quoted message.');
            console.error(err);        
        } finally {
            isProcessing = false;
        }
    }, 5000);
}

function handleImageMessage(message) {
    console.log("Processing an image message...");

    const chat = Store.Chat.get(message.chat.id._serialized);
    if (!chat) {
        console.log(`Could not find chat: ${message.chat.id._serialized}`);
        return;
    }

    Store.UiController.openChatBottom(chat);

    let maxWaitCount = 8;
    let isProcessing = false;
    const imageWaitInterval = setInterval(async function() {
        if (maxWaitCount <= 0) {
            console.log("Could not resolve the image, tried the maximum number of times.");
            clearInterval(imageWaitInterval);
            return;
        } else if (isProcessing) {
            console.log("Still processing last interval, exiting...");
            return;
        }

        try {
            maxWaitCount--;
            isProcessing = true;

            const updatedMessage = WAPI.getMessageById(message.id);
            console.log(updatedMessage);

            if (!updatedMessage) {
                console.log("Could not find message, aborting...");
                clearInterval(imageWaitInterval);
                return;
            } else if (updatedMessage.mediaData.mediaStage === 'RESOLVED') {
                console.log("Media resolved...");
                if (updatedMessage.mediaData.mediaBlob) {
                    clearInterval(imageWaitInterval);
                
                    const data = await window.WAPI.fileToBase64(originalMessage.mediaData.mediaBlob._blob);
                    originalMessage.body = data;
                    processMessage(updatedMessage);
                    return;
                }
            }
            
            if (getImageUrl(updatedMessage) && updatedMessage.mediaKey && updatedMessage.mimetype) {
                clearInterval(imageWaitInterval);
                
                const data = await window.WAPI.downloadFileAndDecrypt({
                    url: getImageUrl(updatedMessage), type: updatedMessage.type, mediaKey: updatedMessage.mediaKey, mimetype: updatedMessage.mimetype 
                });
                const originalMessage = WAPI.getMessageById(message.id);
                originalMessage.body = data.result;
                processMessage(originalMessage);
            }
        } finally {
            isProcessing = false;
        }        
    }, 3000);
}

WAPI.waitNewMessages(false, (data) => {
    if (!data || !(data instanceof Array)) return;

    data.forEach((message) => {
        console.log(message);

        if (message.type === 'chat') {
            if (message.quotedMsgObj && (message.quotedMsgObj.type === "sticker" || 
                                            message.quotedMsgObj.type === "image" || 
                                            message.quotedMsgObj.type === "video" ||
                                            message.quotedMsgObj.type === "ptt")) {
                handleQuotedImage(message);
            }
            else {
                processMessage(message);
            }
        }
        else if ((message.type === 'image' || message.type === 'video') && message.caption && message.caption.length > 0) {
            handleImageMessage(message);
        }
    });
});