//Copyright (c) 2015 Eric Vallee <eric_vallee2003@yahoo.ca>
//MIT License: https://raw.githubusercontent.com/Magnitus-/ExpressUserLocal/master/License.txt

var Nimble = require('nimble');
var Express = require('express');
var Http = require('http');
var ExpressUser = require('express-user');
var ExpressUserLocal = require('../lib/ExpressUserLocal');
var UserProperties = require('user-properties');
var UserStore = require('user-store');
var MongoDB = require('mongodb');
var Session = require('express-session');
var SessionStore= require('express-session-mongodb');
var BodyParser = require('body-parser');

var Context = {};

var RandomIdentifier = 'ExpressUserTests'+Math.random().toString(36).slice(-8);

var SessionStoreOptions = {'TimeToLive': 300, 'IndexSessionID': true, 'DeleteFlags': true};

function Middleware(Routes)
{
    return(function(Router, Roles) {
        Routes.forEach(function(Route) {
            Router[Route['Method']](Route['Path'], Route['Call']);
        });
    });
}

function Setup(ValidationHandler, ResponseRoutes, Callback)
{
    var UserSchema = UserProperties({'Email': {'Required': true, 'Unique': true, 'Privacy': UserProperties.Privacy.Private},
                      'Username': {'Required': true, 'Unique': true, 'Privacy': UserProperties.Privacy.Public},
                      'Password': {'Required': true, 'Privacy': UserProperties.Privacy.Secret, 'Retrievable': false}});
    MongoDB.MongoClient.connect("mongodb://localhost:27017/"+RandomIdentifier, {native_parser:true}, function(Err, DB) {
        UserStore(DB, UserSchema, function(Err, UserStoreInst) {
            SessionStore(DB, function(Err, SessionStoreInst) {
                Context['DB'] = DB;
                Context['UserStore'] = UserStoreInst;
                var App = Context['App'] = Express();
                
                App.use(Session({
                    'secret': 'qwerty!',
                    'resave': true,
                    'saveUninitialized': true,
                    'store': SessionStoreInst
                }));
                
                App.use(BodyParser.json());
                
                var UserRouter = ExpressUser(UserStoreInst, {'Validator': ValidationHandler, 'Responder': Middleware(ResponseRoutes)});
                App.use(ExpressUser.SessionRoute(UserStoreInst, '_id'));
                
                App.put('/User/Self/Memberships/Admin', function(Req, Res, Next) {
                    if(Req.session.User)
                    {
                        UserStoreInst.AddMembership({'Email': Req.session.User.Email}, 'Admin', function(Err, Result) {
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
                
                App.get('/Session/Self/User', function(Req, Res, Next) {
                    if(Req.session.User)
                    {
                        Res.status(200).json(Req.session.User);
                    }
                    else
                    {
                        Res.status(400).end();
                    }
                });
                
                App.use(UserRouter);
                
                App.use('/', function(Err, Req, Res, Next) {
                    if(Err.Type)
                    {
                        Res.status(400).json({'ErrType': Err.Type, 'ErrSource': Err.Source});
                    }
                    else
                    {
                        Next(Err);
                    }
                });
                
                Context['Server'] = Http.createServer(Context['App']);
                Context['Server'].listen(8080, function() {
                    Callback();
                });
            }, SessionStoreOptions);
        });
    });
}

function TearDown(Callback)
{
    Context.Server.close(function() {
        Context.DB.dropDatabase(function(Err, Result) {
            Context.DB.close();
            Callback();
        });
    });
}

function RequestHandler()
{
    this.SessionID = null;
    if(!RequestHandler.prototype.SetSessionID)
    {
        RequestHandler.prototype.SetSessionID = function(Headers) {
            if(Headers["set-cookie"])
            {
                var SessionCookie = Headers["set-cookie"][0];
                SessionCookie = SessionCookie.slice(String("connect.sid=").length, SessionCookie.indexOf(';'));
                this.SessionID = SessionCookie;
            }
        };
        
        RequestHandler.prototype.Request = function(Method, Path, Callback, ReqBody, GetBody) {
            var Self = this;
            var RequestObject = {'hostname': 'localhost', 'port': 8080, 'method': Method, 'path': Path, 'headers': {'Accept': 'application/json'}};
            if(this.SessionID)
            {
                RequestObject['headers']['cookie'] = 'connect.sid='+this.SessionID;
            }
            if(ReqBody)
            {
                RequestObject.headers['Content-Type']='application/json';
                RequestObject.headers['Content-Length']=(JSON.stringify(ReqBody)).length;
            }
            var Req = Http.request(RequestObject, function(Res) {
                Res.setEncoding('utf8');
                var Body = "";
                if(!GetBody)
                {
                    Res.resume();
                }
                else
                {
                    Res.on('data', function (Chunk) {
                        Body+=Chunk;
                    });
                }
                Res.on('end', function() {
                    Self.SetSessionID(Res.headers);
                    Body = GetBody && Body ? JSON.parse(Body) : null;
                    Callback(Res.statusCode, Body);
                });
            });
            if(ReqBody)
            {
                Req.write(JSON.stringify(ReqBody), function() {
                    Req.end();
                });
            }
            else
            {
                Req.end();
            }
        };
    }
}

function CreateAndLogin(Requester, Credentials, Callback, Elevate)
{
    Requester.Request('POST', '/Users', function(Status, Body) {
        Requester.Request('PUT', '/Session/Self/User', function(Status, Body) {
            if(Elevate)
            {
                Requester.Request('PUT', '/User/Self/Memberships/Admin', function(Status, Body) {
                    Callback();
                }, {'User': {}}, false);
            }
            else
            {
                Callback();
            }
        }, {'User': Credentials}, false);
    }, {'User': Credentials}, false);
}

var SuccessRoute = {'Method': 'use', 'Path': '/', 'Call': function(Req, Res, Next) {
    if(Res.locals.ExpressUser)
    {
        if(Res.locals.ExpressUser.Result===undefined)
        {
            Res.status(200).end();
        }
        else if(typeof(Res.locals.ExpressUser.Result) === typeof(0))
        {
            Res.status(200).json({'Count': Res.locals.ExpressUser.Result});
        }
        else
        {
            Res.status(200).json(Res.locals.ExpressUser.Result);
        }
    }
}};

var FakeCrsf = function(Req, Res, Next)
{
    Res.locals.FakeCrsf = true;
    Next();
}

var FakeBrute = function(Req, Res, Next)
{
    Res.locals.FakeBrute = true;
    Next();
}

var FakeConnectionSecurity = function(Req, Res, Next)
{
    Res.locals.ConnectionSecurity = true;
    Next();
}


var FakeEmail = function(Req, Res, Next)
{
    if(Res.locals.ExpressUser && Res.locals.ExpressUser.User)
    {
        var User = Res.locals.ExpressUser.User;
        Res.locals.Email = {'Email': User.Email, 'EmailToken': User.EmailToken, 'Password': User.Password};
    }
    Next();
    
}


//Test Custom Verification
//Test Hide vs non-hide
//Use more detailed schema in user-properties test

exports.Main = {
    'setUp': function(Callback) {
        Setup([BodyRoute], [SuccessRoute], Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    }
    'SessionExistenceCheck': function(Test) {
        /*Test.expect(6);
        var Requester = new RequestHandler();
        Requester.Request('GET', '/User/Self', function(Status, Body) {
            Test.ok(Status===400 && Body.ErrType && Body.ErrType==='NoAccess', 'Confirming that session existence check with GET /User/Self works.');
            Requester.Request('DELETE', '/User/Self', function(Status, Body) {
                Test.ok(Status===400 && Body.ErrType && Body.ErrType==='NoAccess', 'Confirming that session existence check with DELETE /User/Self works.');
                Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                    Test.ok(Status===400 && Body.ErrType && Body.ErrType==='NoAccess', 'Confirming that session existence check with PATCH /User/Self works.');
                    Requester.Request('PUT', '/User/Self/Memberships/Clown', function(Status, Body) {
                        Test.ok(Status===400 && Body.ErrType && Body.ErrType==='NoAccess', 'Confirming that session existence check with PUT /User/Self/Memberships/:Membership works.');
                        Requester.Request('DELETE', '/User/Self/Memberships/Clown', function(Status, Body) {
                            Test.ok(Status===400 && Body.ErrType && Body.ErrType==='NoAccess', 'Confirming that session existence check with DELETE /User/Self/Memberships/:Membership works.');
                            Requester.Request('POST', '/User/Self/Recovery/MyCat', function(Status, Body) {
                                Test.ok(Status===400 && Body.ErrType && Body.ErrType==='NoAccess', 'Confirming that session existence check with POST /User/Self/Recovery/:SetField works.');
                                Test.done();
                            }, null, true);
                        }, null, true);
                    }, null, true);
                }, null, true);
            }, null, true);
        }, null, true);*/
    }}
    

