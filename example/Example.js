//Copyright (c) 2015 Eric Vallee <eric_vallee2003@yahoo.ca>
//MIT License: https://raw.githubusercontent.com/Magnitus-/ExpressUser/master/License.txt

var Http = require('http');
var Path = require('path');

var Express = require('express');
var BodyParser = require('body-parser');
var Csrf = require('csurf');

var MongoDB = require('mongodb');
var Session = require('express-session');
var SessionStoreAPI = require('express-session-mongodb');
var UserStoreAPI = require('user-store');
var ExpressUserLocal = require('../lib/ExpressUserLocal');
var ExpressUser = require('express-user');

var ExpressBruteAPI = require('express-brute');
var BruteStoreAPI = require('express-brute-mongo');

var App = Express();

var RandomIdentifier = 'ExpressUserExample'+Math.random().toString(36).slice(-8);

var SessionStoreOptions = {'TimeToLive': 300, 'IndexSessionID': true, 'DeleteFlags': true};
var Wait = 25*60*60*1000;
var ExpressBruteOptions = {'freeRetries': 10, 'minWait': Wait, 'maxWait': Wait, 'lifetime': 60*60, 'refreshTimeoutOnRequest': false};

var StaticPath = Path.resolve(__dirname, 'Static');
App.set("view engine", "ejs");
App.set("views", Path.resolve(__dirname, "Views"));

var CsrfRoute = Csrf({ cookie: false });

MongoDB.MongoClient.connect("mongodb://localhost:27017/"+RandomIdentifier, {native_parser:true}, function(Err, DB) {
    DB.createCollection('PasswordAccess', {'w': 1}, function(Err, BruteCollection) {
        var BruteStore = new BruteStoreAPI(function (Ready) {Ready(BruteCollection)});
        var ExpressBrute = new ExpressBruteAPI(BruteStore, ExpressBruteOptions);
        function MockSendEmail(User, Token, Callback)
        {
            console.log('Email: '+User['Email']+"; Token: "+Token);
            Callback(null);
        }
        var ExpressUserLocalOptions = {'BruteForceRoute': ExpressBrute.prevent, 'CsrfRoute': CsrfRoute, 'SendEmail': MockSendEmail};
        UserStoreAPI(DB, {'Email': {'Unique': 1, 'NotNull': 1}, 'Username': {'Unique': 1, 'NotNull': 1}, 'Password': {'NotNull': 1}}, function(Err, UserStore) {
            SessionStoreAPI(DB, function(Err, SessionStore) {
                
                App.use(Session({
                    'secret': 'qwerty!',
                    'resave': true,
                    'saveUninitialized': true,
                    'store': SessionStore
                }));
                               
                App.use('/Static', Express.static(StaticPath));
                App.use(BodyParser.json());
                
                var UserRouter = ExpressUser(UserStore, {'Validator': ExpressUserLocal(ExpressUserLocalOptions)});
                App.use(ExpressUser.SessionRoute(UserStore, '_id'));
                App.use(UserRouter);
                
                //Obviously for testing purposes, never put this in a production environment without rock-solid access control
                App.post('/User/Self/Memberships/Admin', function(Req, Res, Next) {
                    if(Req.session.User)
                    {
                        UserStore.AddMembership({'Email': Req.session.User.Email}, 'Admin', function(Err, Result) {
                            if(Err)
                            {
                                Next(Err);
                            }
                            else
                            {
                                if(Result>0)
                                {
                                    Res.status(200).end();
                                }
                                else
                                {
                                    Res.status(400).end();
                                }
                            }
                        });
                    }
                    else
                    {
                        Res.status(400).end();
                    }
                });
                
                //Probably another questionable one to put in a production environment for regular users
                App.get('/Session/Self/User', function(Req, Res, Next) {
                    if(Req.session.User)
                    {
                        Res.json(Req.session.User);
                    }
                    else
                    {
                        Res.status(400).end();
                    }
                });
                
                App.get('/', CsrfRoute);
                App.get('/', function(Req, Res) {
                    Res.render("Index", {'CsrfToken': Req.csrfToken()});
                });
                
                App.use('/', function(Err, Req, Res, Next) {
                    if(Err.code !== 'EBADCSRFTOKEN') 
                    {
                        next(Err);
                        return;
                    }
                    else
                    {
                        Res.status(403).end();
                    }
                });
                
                Http.createServer(App).listen(8080);
            }, SessionStoreOptions);
        });
    });
});
