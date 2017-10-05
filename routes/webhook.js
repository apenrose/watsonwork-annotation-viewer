// Sign and verify Watson Work requests and responses

// Feel free to adapt to your particular security and hosting environment

var express = require('express');
var router = express.Router();
const crypto = require('crypto');
const debug = require('debug');
var request = require('request');
var rp = require('request-promise')

var fs = require('fs');
var storage = require('node-persist');

var bparser = require('body-parser');

// Setting your app id , app secret and webhook secret values.
const APP_ID = "98cd5f16-4d04-4909-a375-5109bf2588dc";
const APP_SECRET = "zBes7nDdZq0JN3DLTOfFIVu6Hu8Q";
const WEBHOOK_SECRET = "hrn9d38umbiypqq0cobwlz6a1ybxdgke";


var jsonParser = bparser.json();

/* Listen on Webhook */
router.post('/',  jsonParser, function(req, res, next) {


    //
    // - Intercepts the verification message and responds to the challenge using the webhook secret.
    // - Does a request for an oauth token which is then stored in a node-persist datastore.
    //
    if (req.body.type === 'verification') {

        const challenge = JSON.stringify({
            response: req.body.challenge
        });

        res.set('X-OUTBOUND-TOKEN',crypto.createHmac('sha256', WEBHOOK_SECRET).update(challenge).digest('hex'));
        res.type('json').send(challenge);


        request.post(
            'https://api.watsonwork.ibm.com/oauth/token',
            {
                auth: {
                    user: APP_ID,
                    pass: APP_SECRET
                },
                json: true,
                form: {
                    grant_type: 'client_credentials'
                }
            },
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(response.body);
                    console.log(response.body.access_token);
                    storage.setItem('token', response.body.access_token);

                }
            }
        );


    }


    //
    // If the outbound token that is received in a request does not match the challenge then a request for an oauth token is made again and stored
    // in node-persist.
    //
    if (req.get('X-OUTBOUND-TOKEN') !== crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex')) {
        console.log('Invalid request signature');
        const err = new Error('Invalid request signature');
        request.post(
            'https://api.watsonwork.ibm.com/oauth/token',
            {
                auth: {
                    user: APP_ID,
                    pass: APP_SECRET
                },
                json: true,
                form: {
                    grant_type: 'client_credentials'
                }
            },
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body);
                    console.log(body.access_token);
                    storage.setItem('token', response.body.access_token);
                }


            }
        );

    }

    //
    //
    //
    if (req.body.type == 'message-created') {

        var spaceId = req.body.spaceId;

        var check = req.body.content.includes("@getannotations");
        var messageId_stored = storage.getItem('messageId');

        // Store the messageId from the text
        if (check==false) {

            var messageId_toStore= req.body.messageId;
            storage.setItem('messageId', messageId_toStore);

        // Get message and show annotations
        } else {

            var messageId_toRetrieve = storage.getItem('messageId');


            var getMessage  = "query getMessage { message(id: \""+ messageId_toRetrieve +"\") {annotations}}"
            console.log(getMessage);

            request.post(
                'https://api.watsonwork.ibm.com/graphql',
                {
                    headers: {
                        'Authorization': 'Bearer ' + storage.getItem('token'),
                        'Content-Type': 'application/graphql',
                        'x-graphql-view': 'PUBLIC'
                    },
                    body: getMessage
                },
                function (error, response, body) {
                    console.log(response.statusCode);
                    if (!error && response.statusCode == 200) {

                        console.log(response.body);

                        var data = JSON.parse(response.body);

                        var annotation_array = data["data"]["message"]["annotations"];

                        var arrayLength = annotation_array.length;

                        for (var i = 0; i < arrayLength; i++) {
                            console.log(annotation_array[i]);

                            var annotation = JSON.parse(annotation_array[i]);
                            var annotationType = annotation.type;
                            console.log(annotationType);

                            var body = JSON.stringify(annotation_array[i])

                            request.post(
                                'https://api.watsonwork.ibm.com/v1/spaces/' + spaceId + '/messages',
                                {
                                    headers: {
                                        'Authorization': 'Bearer ' + storage.getItem('token'),
                                        'spaceid': spaceId

                                    },
                                    body: {
                                        "type": "appMessage",
                                        "version": "1",

                                        "annotations": [
                                            {

                                                "type": "generic",
                                                "version": "1",

                                                "color": "#36a64f",
                                                "title": "Annotation : " + annotationType,
                                                "text": "` " + body +" `",

                                            }
                                        ]
                                    },
                                    json: true
                                },
                                function (error, response, body) {
                                    if (!error && response.statusCode == 200) {
                                        console.log(response.body);

                                    } else {
                                        console.log(error);
                                    }
                                }
                            );

                        }

                        storage.setItem('messageId', "");

                    } else {
                        console.log(error);
                    }
                }
            );

        }
    }


    res.send();

});

/* Listen on Webhook */
router.get('/', function(req, res, next) {
    res.send('Get method on webhook');

});


module.exports = router;
