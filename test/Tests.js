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
var Uid = require('uid-safe').sync;

var EmailRegex = require('regex-email');
var UsernameRegex = new RegExp("^[a-zA-Z][\\w\\+\\-\\.]{0,19}$");
var PasswordRegex = new RegExp("^.{8,20}$");

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

function Setup(ValidationHandler, ResponseRoutes, StoreUserSchema, Callback)
{
    var UserSchema = StoreUserSchema;
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
                        var ErrBody = {'ErrType': Err.Type, 'ErrSource': Err.Source};
                        if(Err.Fields)
                        {
                            ErrBody['ErrFields'] = Err.Fields;
                        }
                        if(Err.UpdateFields)
                        {
                            ErrBody['ErrUpdateFields'] = Err.UpdateFields;
                        }
                        Res.status(400).json(ErrBody);
                    }
                    else
                    {
                        Next(Err);
                    }
                });
                
                App.use('/', function(Req, Res, Next) {
                    Res.status(404).end();
                });
                
                Context['Server'] = Http.createServer(Context['App']);
                Context['Server'].listen(8080, function() {
                    Callback();
                });
            }, SessionStoreOptions);
        }, {'Iterations': 5});
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

var FakeCsrf = function(Req, Res, Next)
{
    Res.locals.FakeCsrf = true;
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

var SuccessRouteFake = {'Method': 'use', 'Path': '/', 'Call': function(Req, Res, Next) {
    var FakeResult = {};
    if(Res.locals.FakeCsrf)
    {
        FakeResult['Csrf'] = true;
    }
    if(Res.locals.FakeBrute)
    {
        FakeResult['Brute'] = true;
    }
    Res.status(200).json(FakeResult);
}};

var SuccessRouteFakeErr = {'Method': 'use', 'Path': '/', 'Call': function(Err, Req, Res, Next) {
    var FakeResult = {};
    if(Res.locals.FakeCsrf)
    {
        FakeResult['Csrf'] = true;
    }
    if(Res.locals.FakeBrute)
    {
        FakeResult['Brute'] = true;
    }
    Res.status(400).json(FakeResult);
}};

//Crafted this way to test non-null requirement outside the validator, but still test for validation by trying strings with length less than 4
function EmailTokenValidation(Value)
{
    if(Value !== null && Value !== undefined && Value.length !== undefined)
    {
        return Value.length > 3;
    }
    else
    {
        return true;
    }
}

function GetUserSchema(NoEmailToken)
{
    var UserSchema = {'Username': {
                      'Required': true,
                      'Unique': true,
                      'Mutable': false,
                      'Description': function(Value) {return UsernameRegex.test(Value)}
                  },
                  'Email': {
                      'Required': true,
                      'Unique': true,
                      'Privacy': UserProperties.Privacy.Private,
                      'Description': function(Value) {return EmailRegex.test(Value)}
                  },
                  'Password': {
                      'Required': true,
                      'Privacy': UserProperties.Privacy.Secret,
                      'Retrievable': false,
                      'Description': function(Value) {return PasswordRegex.test(Value)},
                      'Sources': ['User', 'Auto'],
                      'Generator': function(Callback) {Callback(null, Uid(15));}
                  },
                  'Gender': {
                      'Privacy': UserProperties.Privacy.Private,
                      'Mutable': false,
                      'Description': function(Value) {return Value=='M'||Value=='F'} //Reality is more complex, but for the sake of this example...
                  },
                  'Age': {
                      'Privacy': UserProperties.Privacy.Private,
                      'Description': function(Value) {return typeof(Value)==typeof(1) && Value > 0}
                  },
                  'Address': {
                      'Required': true,
                      'Privacy': UserProperties.Privacy.Private
                  },
                  'EmailToken': {
                      'Required': true,
                      'Privacy': UserProperties.Privacy.Secret,
                      'Access': 'Email',
                      'Sources': ['Auto'],
                      'Generator': function(Callback) {Callback(null, Uid(20));},
                      'Description': EmailTokenValidation
                  },
                  '_id': {
                      'Privacy': UserProperties.Privacy.Private,
                      'Access': 'System',
                      'Sources': ['MongoDB']
                  }};
    
    if(NoEmailToken)
    {
        delete UserSchema.EmailToken;
    }
    
    UserSchema = UserProperties(UserSchema);
    
    return UserSchema;
}

function In()
{
    var InList = arguments[0];
    var CheckList = Array.prototype.slice.call(arguments, 1);
    return(CheckList.every(function(CheckItem) {
        return(InList.some(function(RefItem) {
            return RefItem===CheckItem;
        }));
    }));
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
            if(Res.locals.ExpressUser.Hide)
            {
                Res.locals.ExpressUser.Hide.forEach(function(ToHide) {
                    delete Res.locals.ExpressUser.Result[ToHide];
                });
            }
            Res.status(200).json(Res.locals.ExpressUser.Result);
        }
    }
    else
    {
        Next();
    }
}};

function GetCoreTests(Route, EmailValidation)
{
    switch(Route)
    {
        case 'POST /Users':
            return(function(Test) {
                Test.expect(7);
                var Requester = new RequestHandler();
                var Calls = [function(Callback) {
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Test.ok(Body.ErrType && Body.ErrType === "BadBody" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /Users require a User property in the body.");
                        Callback();
                    }, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho'}, true);
                },
                function(Callback) {
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === "BadField" && Body.ErrFields.length === 1 && In(Body.ErrFields, 'Address'), "Confirming that POST /Users requires required fields to be defined.");
                        Callback();
                    }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho'}}, true);
                },
                function(Callback) {
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === "BadField" && Body.ErrFields.length === 2 && In(Body.ErrFields, 'Address', 'Password'), "Confirming that POST /Users requires required fields to be not null.");
                        Callback();
                    }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': null, 'Address': null}}, true);
                },
                function(Callback) {
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === "BadField" && Body.ErrFields.length === 3 && In(Body.ErrFields, 'Username', 'Email', 'Password'), "Confirming that POST /Users requires required fields to pass validation.");
                        Callback();
                    }, {'User': {'Username': '12Magnitus', 'Email': 'ma', 'Password': '1', 'Address': 'Vinvin du finfin'}}, true);
                },
                function(Callback) {
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, User) {
                            if(EmailValidation)
                            {
                                var TestResult = Status===200 && User.Username==='Magnitus' && User.Email === 'ma@ma.ma' && User.EmailToken;
                                var TestMessage = "Confirming that POST /Users with only required fields work and that email authentication is generated.";
                            }
                            else
                            {
                                var TestResult = Status===200 && User.Username==='Magnitus' && User.Email === 'ma@ma.ma';
                                var TestMessage = "Confirming that POST /Users with only required fields work.";
                            }
                            Test.ok(TestResult, TestMessage);
                            Callback();
                        });
                    }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin'}}, true);
                },
                function(Callback) {
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === "BadField" && Body.ErrFields.length === 2 && In(Body.ErrFields, 'Gender', 'Age'), "Confirming that POST /Users requires non-required fields, if present, to pass validation.");
                        Callback();
                    }, {'User': {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'It', 'Age': -10}}, true);
                },
                function(Callback) {
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Context.UserStore.Get({'Username': 'Magnitus2'}, function(Err, User) {
                            Test.ok(Status===200 && User.Gender === 'M' && User.Age === 999, "Confirming that non-required fields are inserted for POST /Users and that the request validates if all fields validate.");
                            Callback();
                        });
                    }, {'User': {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}}, true);
                }];
                Nimble.series(Calls, function(Err) {
                    Test.done();
                });
            });
            break;
        case 'PUT /Session/Self/User':
            return(function(Test) {
                Test.expect(7);
                var Requester = new RequestHandler();
                Requester.Request('PUT', '/Session/Self/User', function(Status, Body) {
                    Test.ok(Body.ErrType && Body.ErrType === "BadBody" && Body.ErrSource === "ExpressUserLocal", "Confirming that PUT /Session/Self/User require a User property in the body.");
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Requester.Request('PUT', '/Session/Self/User', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === 'NoID' && Body.ErrSource === 'ExpressUserLocal', "Confirming that PUT /Session/Self/User requires a suitable login ID.");
                            Requester.Request('PUT', '/Session/Self/User', function(Status, Body) {
                                Test.ok(Body.ErrType && Body.ErrType === 'NoID' && Body.ErrSource === 'ExpressUserLocal', "Confirming that PUT /Session/Self/User doesn't accept null value for login.");
                                Requester.Request('PUT', '/Session/Self/User', function(Status, Body) {
                                    Test.ok(Body.ErrType && Body.ErrType === 'NoAuth' && Body.ErrSource === 'ExpressUserLocal', "Confirming that PUT /Session/Self/User requires authentication.");
                                    Requester.Request('PUT', '/Session/Self/User', function(Status, Body) {
                                        Test.ok(Body.ErrType && Body.ErrType === 'NoAuth' && Body.ErrSource === 'ExpressUserLocal', "Confirming that PUT /Session/Self/User doesn't accept null for authentication.");
                                        Requester.Request('PUT', '/Session/Self/User', function(Status, Body) {
                                            Test.ok(Body.ErrType && Body.ErrType === 'NoUser' && Body.ErrSource === 'ExpressUser', "Confirming that PUT /Session/Self/User passes invalid authentication to express-user properly.");
                                            Requester.Request('PUT', '/Session/Self/User', function(Status, Body) {
                                                Test.ok(Status===200, "Confirming that PUT /Session/Self/User with the right parameters work.");
                                                Test.done();
                                            }, {'User': {'Email': 'ma@ma.ma', 'Password': 'hahahihihoho'}}, true);
                                        }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihuhu', 'Address': 'Vinvin du finfin'}}, true);
                                    }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': null, 'Address': 'Vinvin du finfin'}}, true);
                                }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Address': 'Vinvin du finfin'}}, true);
                            }, {'User': {'Username': 'Magnitus', 'Email': null, 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin'}}, true);
                        }, {'User': {'Username': 'Magnitus', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin'}}, true);
                    }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin'}}, true);
                }, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin'}, true);
            });
            break;
        case 'DELETE /Session/Self/User':
            return(function(Test) {
                Test.expect(1);
                var Requester = new RequestHandler();
                Requester.Request('DELETE', '/Session/Self/User', function(Status, Body) {
                    Test.ok(Body.ErrType && Body.ErrType === "NoSessionUser" && Body.ErrSource === "ExpressUser", "Confirming that DELETE /Session/Self/User request is passed to express-user.");
                    Test.done();
                }, {}, true);
            });
            break;
        case 'GET /User/Self':
            return(function(Test) {
                Test.expect(2);
                var Requester = new RequestHandler();
                Requester.Request('GET', '/User/Self', function(Status, Body) {
                    Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that GET /User/Self requires the user to be logged in.");
                    CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                        Requester.Request('GET', '/User/Self', function(Status, Body) {
                            Test.ok(Body.Username==='Magnitus' && Body.Address === 'Vinvin du finfin' && Body.Email === 'ma@ma.ma' && Body.Gender === 'M' && Body.Age === 999 && (!Body.Password) && (!Body.EmailToken) && (!Body._id), "Confirming that GET /User/Self retrieves user from session and specifies the right fields to hide.");
                            Test.done();
                        }, {}, true);
                    }, false);
                }, {}, true);
            });
            break;
        case 'GET /User/:Field/:ID':
            return(function(Test) {
                Test.expect(7);
                var Requester = new RequestHandler();
                Requester.Request('GET', '/User/Username/AhAh', function(Status, Body) {
                    Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that GET /User/:Field/:ID requires the user to be logged in.");   
                    CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                        Requester.Request('GET', '/User/Username/Magnitus', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that GET /User/:Field/:ID requires the user to have the right privileges.");  
                            CreateAndLogin(Requester, {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                                Requester.Request('GET', '/User/Username/Magnitus', function(Status, Body) {
                                    if(EmailValidation)
                                    {
                                        var TestResult = Status===200 && Body.Username === 'Magnitus' && Body.Email === 'ma@ma.ma' && Body.Gender === 'M' && Body.Age === 999 && Body.Password && Body.EmailToken && Body._id;
                                    }
                                    else
                                    {
                                        var TestResult = Status===200 && Body.Username === 'Magnitus' && Body.Email === 'ma@ma.ma' && Body.Gender === 'M' && Body.Age === 999 && Body.Password && Body._id;
                                    }
                                    Test.ok(TestResult, "Confirming that GET /User/:Field/:ID accessed with the right privileges retrieves the user and doesn't hide any fields.");
                                    Requester.Request('GET', '/User/Username/Magnitus3', function(Status, Body) {
                                        Test.ok(Body.ErrType && Body.ErrType === 'NoUser' && Body.ErrSource === 'ExpressUser', "Confirming that GET /User/:Field/:ID with the right privileges on a non-existent user gets passed to express-user.");
                                        Requester.Request('GET', '/User/Username/123', function(Status, Body) {
                                            Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === 'BadField' && Body.ErrFields.length === 1 && Body.ErrFields[0] === 'Username', "Confirming that GET /User/:Field/:ID performs validation on Field.");
                                            Requester.Request('GET', '/User/lalala/123', function(Status, Body) {
                                                Test.ok(Body.ErrType && Body.ErrType === "NoID" && Body.ErrSource === "ExpressUserLocal", "Confirming that GET /User/:Field/:ID requires Field to exist."); 
                                                Requester.Request('GET', '/User/Password/hihihoho', function(Status, Body) {
                                                    Test.ok(Body.ErrType && Body.ErrType === "NoID" && Body.ErrSource === "ExpressUserLocal", "Confirming that GET /User/:Field/:ID requires Field to be a valid identifier.");
                                                    Test.done();
                                                }, {}, true);
                                            }, {}, true);
                                        }, {}, true);
                                    }, {}, true);
                                }, {}, true);
                            }, true);
                        }, {}, true);
                    });
                }, {}, true);
            });
            break;
        case 'PATCH /User/Self':
            return(function(Test) {
                Test.expect(10);
                var Requester = new RequestHandler();
                var Calls = [
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that PATCH /User/Self requires the user to be logged in."); 
                            Callback()
                        }, {'Update': {'Username': 'abcde', 'Password': 'abcde'}}, true);
                    },
                    function(Callback) {
                        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                            Callback();
                        });
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === "BadBody" && Body.ErrSource === "ExpressUserLocal", "Confirming that PATCH /User/Self require an Update property in the body.");
                            Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                                Test.ok(Body.ErrType && Body.ErrType === "BadBody" && Body.ErrSource === "ExpressUserLocal", "Confirming that PATCH /User/Self require an User property in the body.");
                                Callback();
                            }, {'Update': {'Username': 'Magnitus'}}, true);
                        }, {'User': {'Password': 'abcdefgg'}}, true);
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === "NoAuth" && Body.ErrSource === "ExpressUserLocal", "Confirming that PATCH /User/Self require an authentication field.");
                            Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                                Test.ok(Body.ErrType && Body.ErrType === "NoField" && Body.ErrSource === "ExpressUserLocal", "Confirming that PATCH /User/Self require at least one field to update.");
                                Callback();
                            }, {'User': {'Password': 'HahaHiHiHoHo'}, 'Update': {}}, true);
                        }, {'User': {'Username': 'Magnitus'}, 'Update': {'Email': 'Magnitus2'}}, true);
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === 'BadField' && Body.ErrFields.length === 1 && Body.ErrFields[0] === 'Password', "Confirming that PATCH /User/Self performs validation on User fields.");
                            Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                                Test.ok(Body.ErrType && Body.ErrUpdateFields && Body.ErrType === 'BadField' && Body.ErrUpdateFields.length === 1 && Body.ErrUpdateFields[0] === 'Email', "Confirming that PATCH /User/Self performs validation on Update fields.");
                                Callback();
                            }, {'User': {'Password': 'adfdfdsfgsdg'}, 'Update': {'Email': '123'}}, true);
                        }, {'User': {'Password': '123'}, 'Update': {'Email': 'Magnitus2'}}, true);
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                            Context.UserStore.Get({'Email': 'ma2@ma.ma', 'Password': 'ILoveMyQwerty!'}, function(Err, User) {
                                Test.ok(Status===200 && User && User.Username === 'Magnitus' && User.Gender === 'M' && User.Age === 1 && User._id !== 999 && User.Memberships !== 'holahola', "Confirming that PATCH /User/Self only updates fields that qualify as editable are edited.");
                                Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                                    Test.ok(Body.ErrType && Body.ErrType === "NoField" && Body.ErrSource === "ExpressUserLocal", "Confirming that specifying only non-editable fields for PATCH /User/Self is the same as specifying no fields.");
                                    Callback();
                                }, {'User': {'Password': 'ILoveMyQwerty!'}, 'Update': {'Username': 'Magnitus2', 'Gender': 'F', '_id': 999, 'Memberships': 'holahola'}}, true);
                            });
                        }, {'User': {'Password': 'hahahihihoho'}, 'Update': {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'ILoveMyQwerty!', 'Gender': 'F', 'Age': 1, 'Address': 'Not your business!', '_id': 999, 'Memberships': 'holahola'}}, true);
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrUpdateFields && Body.ErrType === 'BadField' && Body.ErrUpdateFields.length === 3 && In(Body.ErrUpdateFields, 'Email', 'Password', 'Address'), "Confirming that PATCH /User/Self performs non-null check on required fields.");
                            Callback();
                        }, {'User': {'Password': 'ILoveMyQwerty!'}, 'Update': {'Email': null, 'Password': null, 'Address': null}}, true);
                    }
                ];
                Nimble.series(Calls, function(Err) {
                    if(Err)
                    {
                        console.log(Err);
                    }
                    Test.done();
                });
            });
            break;
        case 'PATCH /User/:Field/:ID':
            return(function(Test) {
                Test.expect(10);
                var Requester = new RequestHandler();
                var Calls = [
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that PATCH /User/:Field/:ID requires the user to be logged in.");
                            CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                                Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                                    Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that PATCH /User/:Field/:ID requires the right privileges to access.");
                                    Callback();
                                }, {'Update': {'Username': 'abcde', 'Password': 'abcde'}}, true);
                            });
                        }, {'Update': {'Username': 'abcde', 'Password': 'abcde'}}, true);
                    },
                    function(Callback) {
                        CreateAndLogin(Requester, {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                            Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                                Test.ok(Body.ErrType && Body.ErrType === "BadBody" && Body.ErrSource === "ExpressUserLocal", "Confirming that PATCH /User/:Field/:ID require an Update property in the body.");
                                Callback();
                            }, {}, true);
                        }, true);
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === "NoField" && Body.ErrSource === "ExpressUserLocal", "Confirming that PATCH /User/:Field/:ID reports when nothing is being updated.");
                            Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                                Test.ok(Body.ErrType === 'BadField' && Body.ErrUpdateFields && In(Body.ErrUpdateFields, 'Username', 'Password', 'Email', 'Gender', 'Age'), "Confirming that PATCH /User/:Field/:ID applies validation properly.");
                                Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                                    if(EmailValidation)
                                    {
                                        var TestResult = Body.ErrType === 'BadField' && Body.ErrUpdateFields && In(Body.ErrUpdateFields, 'Username', 'Email', 'Password', 'Address', 'EmailToken');
                                    }
                                    else
                                    {
                                        var TestResult = Body.ErrType === 'BadField' && Body.ErrUpdateFields && In(Body.ErrUpdateFields, 'Username', 'Email', 'Password', 'Address');
                                    }
                                    Test.ok(TestResult, "Confirming that PATCH /User/:Field/:ID ensures required fields are not null.");
                                    Callback();
                                }, {'Update': {'Username': null, 'Email': null, 'Password': null, 'Address': null, 'EmailToken': null}}, true);
                            }, {'Update': {'Username': '123', 'Password': '', 'Email': '123', 'Gender': '???', 'Age': -1}}, true);
                        }, {'Update': {}}, true);
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                            Context.UserStore.Get({'Email': 'ma3@ma.ma', 'Password': '123456789'}, function(Err, User) {
                                if(EmailValidation)
                                {
                                    var TestResult = Status === 200 && User && User.Username === 'Magnitus3' && User.Gender === 'F' && User.Age === 1 && User.Address === '123' && User.EmailToken === 'abcd';
                                }
                                else
                                {
                                    var TestResult = Status === 200 && User && User.Username === 'Magnitus3' && User.Gender === 'F' && User.Age === 1 && User.Address === '123' && (!User.EmailToken);
                                }
                                Test.ok(TestResult, "Confirming that updates on PATCH /User/:Field/:ID by user with sufficient privileges work.");
                                Callback();
                            });
                        }, {'Update': {'Username': 'Magnitus3', 'Password': '123456789', 'Email': 'ma3@ma.ma', 'Gender': 'F', 'Age': 1, 'Address': '123', 'EmailToken': 'abcd'}}, true);
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Username/123', function(Status, Body) {
                            Test.ok(Body.ErrType === 'BadField' && Body.ErrFields && In(Body.ErrFields, 'Username'), "Confirming that PATCH /User/:Field/:ID validates ID.");
                            Requester.Request('PATCH', '/User/Gender/M', function(Status, Body) {
                                Test.ok(Body.ErrType === 'NoID', "Confirming that PATCH /User/:Field/:ID checks that Field is an identifier.");
                                Callback();
                            }, {'Update': {'Username': 'Magnitus3'}}, true);
                        }, {'Update': {'Username': 'Magnitus3'}}, true);
                    },
                    function(Callback) {
                        Requester.Request('PATCH', '/User/Username/Gogogogogogogo', function(Status, Body) {
                            Test.ok(Body.ErrType === 'NoUpdate' && Body.ErrSource === 'ExpressUser', "Confirming that PATCH /User/:Field/:ID doesn't interfere with express-user error handling.");
                            Callback();
                        }, {'Update': {'Username': 'Magnitussss'}}, true);
                    }
                ];
                Nimble.series(Calls, function(Err) {
                    if(Err)
                    {
                        console.log(Err);
                    }
                    Test.done();
                });
            });
            break;
        case 'DELETE /User/Self':
            return(function(Test) {
                Test.expect(6);
                var Requester = new RequestHandler();
                Requester.Request('DELETE', '/User/Self', function(Status, Body) {
                    Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that DELETE /User/Self requires a User to be logged in.");
                    CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                        Requester.Request('DELETE', '/User/Self', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === "BadBody" && Body.ErrSource === "ExpressUserLocal", "Confirming that DELETE /User/Self require a User property in the body.");
                            Requester.Request('DELETE', '/User/Self', function(Status, Body) {
                                Test.ok(Body.ErrType && Body.ErrType === "NoAuth" && Body.ErrSource === "ExpressUserLocal", "Confirming that DELETE /User/Self requires authentication.");
                                Requester.Request('DELETE', '/User/Self', function(Status, Body) {
                                    Test.ok(Body.ErrType === "BadField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Password'), "Confirming that DELETE /User/Self performs validation on authentication.");
                                    Requester.Request('DELETE', '/User/Self', function(Status, Body) {
                                        Test.ok(Body.ErrType === "NoDelete" && Body.ErrSource === "ExpressUser", "Confirming that DELETE /User/Self doesn't interfere with express-user error handling.");
                                        Requester.Request('DELETE', '/User/Self', function(Status, Body) {
                                            Context.UserStore.Get({'Email': 'ma@ma.ma'}, function(Err, User) {
                                                Test.ok(!User, "Confirming that DELETE /User/Self with proper authentication deletes a user");
                                                Test.done();
                                            });
                                        }, {'User': {'Password': 'hahahihihoho'}}, true);
                                    }, {'User': {'Password': 'hahaaaaaaaaa'}}, true);
                                }, {'User': {'Password': '123'}}, true);
                            }, {'User': {'Username': 'Hahahahaha!'}}, true);
                        }, {}, true);
                    });
                }, {'User': {}}, true);
            });
            break;
        case 'DELETE /User/:Field/:ID':
            return(function(Test) {
                Test.expect(5);
                var Requester = new RequestHandler();
                Requester.Request('DELETE', '/User/Username/Magnitus', function(Status, Body) {
                    Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that DELETE /User/:Field/:ID requires a User to be logged in.");
                    CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                        Requester.Request('DELETE', '/User/Username/Magnitus', function(Status, Body) {
                            Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that DELETE /User/:Field/:ID requires special access privileges.");
                            CreateAndLogin(Requester, {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                                Requester.Request('DELETE', '/User/Username/123', function(Status, Body) {
                                    Test.ok(Body.ErrType === "BadField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Username'), "Confirming that DELETE /User/:Field/:ID performs validation on ID.");
                                    Requester.Request('DELETE', '/User/Gender/M', function(Status, Body) {
                                        Test.ok(Body.ErrType === "NoID" && Body.ErrSource === "ExpressUserLocal", "Confirming that DELETE /User/:Field/:ID requires Field to be a valid ID.");
                                        Requester.Request('DELETE', '/User/Username/Magnitus', function(Status, Body) {
                                            Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, User) {
                                                Test.ok((!User) && Status === 200, "Confirming that DELETE /User/:Field/:ID with the proper parameters and right privileges works.");
                                                Test.done();
                                            });
                                        }, {}, true);
                                    }, {}, true)
                                }, {}, true);
                            }, true);
                        }, {}, true);
                    });
                }, {}, true);
            });
            break;
        case 'GET /Users/:Field/:ID/Count':
            return(function(Test) {
                Test.expect(8);
                var Requester = new RequestHandler();
                Requester.Request('GET', '/Users/LOLZ/123/Count', function(Status, Body) {
                    Test.ok(Body.ErrType && Body.ErrType === "NoField" && Body.ErrSource === "ExpressUserLocal", "Confirming that GET /User/:Field/:ID/Count requires a field that is defined in the schema.");
                    Requester.Request('GET', '/Users/Username/123/Count', function(Status, Body) {
                        Test.ok(Body.ErrType && Body.ErrType === "BadField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Username'), "Confirming that GET /User/:Field/:ID/Count validates ID.");
                        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                            Requester.Request('GET', '/Users/Email/ma@ma.ma/Count', function(Status, Body) {
                                Test.ok(Body.ErrType && Body.ErrType === "PrivateField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Email'), "Confirming that GET /User/:Field/:ID/Count protects private fields from illegitimate access.");
                                Requester.Request('GET', '/Users/Password/123456789/Count', function(Status, Body) {
                                    Test.ok(Body.ErrType && Body.ErrType === "PrivateField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Password'), "Confirming that GET /User/:Field/:ID/Count protects secret fields from illegitimate access.");
                                    Requester.Request('GET', '/Users/Username/Magnitus/Count', function(Status, Body) {
                                        Test.ok(Status === 200 && Body.Count && Body.Count === 1, "Confirming that GET /User/:Field/:ID/Count works properly when accessing a public field.");
                                        CreateAndLogin(Requester, {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                                            Requester.Request('GET', '/Users/Email/ma@ma.ma/Count', function(Status, Body) {
                                                Test.ok(Status === 200 && Body.Count && Body.Count === 1, "Confirming that GET /User/:Field/:ID/Count works properly for a user with sufficient access when accessing a private field.");
                                                Requester.Request('GET', '/Users/Gender/M/Count', function(Status, Body) {
                                                    Test.ok(Status === 200 && Body.Count && Body.Count === 2, "Confirming that GET /User/:Field/:ID/Count works properly when accessing a non-ID field.");
                                                    Requester.Request('GET', '/Users/Gender/F/Count', function(Status, Body) {
                                                        Test.ok(Status === 200 && Body.Count === 0, "Confirming that GET /User/:Field/:ID/Count works properly when the count is 0.");
                                                        Test.done();
                                                    }, {}, true);
                                                }, {}, true);
                                            }, {}, true);
                                        }, true);
                                    }, {}, true);
                                }, {}, true);
                            }, {}, true);
                        });
                    }, {}, true);
                }, {}, true);
            });
            break;
        case 'PUT /User/:Field/:ID/Memberships/:Membership':
            return(function(Test) {
                Test.expect(5);
                var Requester = new RequestHandler();
                Requester.Request('PUT', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                    Test.ok(Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that PUT /User/:Field/:ID/Memberships/:Membership requires a User to be logged in.");
                    CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                        Requester.Request('PUT', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                            Test.ok(Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that PUT /User/:Field/:ID/Memberships/:Membership requires special access privileges.");
                            CreateAndLogin(Requester, {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                                Requester.Request('PUT', '/User/Username/123/Memberships/Test', function(Status, Body) {
                                    Test.ok(Body.ErrType === "BadField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Username') , "Confirming that PUT /User/:Field/:ID/Memberships/:Membership validates ID.");
                                    Requester.Request('PUT', '/User/Username/DoesNotExist/Memberships/Test', function(Status, Body) {
                                        Test.ok(Body.ErrType === "NoInsertion" && Body.ErrSource === "ExpressUser", "Confirming that PUT /User/:Field/:ID/Memberships/:Membership passes non-existent user to express-user.");
                                        Requester.Request('PUT', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                                            Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, User) {
                                                Test.ok(Status=== 200 && In(User.Memberships, 'Test'), "Confirming that membership insertion with sufficient privileges works");
                                                Test.done();
                                            });
                                        }, {}, true);
                                    }, {}, true);
                                }, {}, true);
                            }, true);
                        }, {}, true);
                    });
                }, {}, true);
            });
            break;
        case 'DELETE /User/Self/Memberships/:Membership':
            return(function(Test) {
                Test.expect(1);
                var Requester = new RequestHandler();
                CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                    Requester.Request('DELETE', '/User/Self/Memberships/DoesNotMatter', function(Status, Body) {
                        Test.ok(Body.ErrType === "NotValidated" && Body.ErrSource === "ExpressUser", "Confirming that the DELETE /User/Self/Memberships/:Membership route is disabled.");
                        Test.done();
                    }, {}, true);
                });
            });
            break;
        case 'DELETE /User/:Field/:ID/Memberships/:Membership':
            return(function(Test) {
                Test.expect(5);
                var Requester = new RequestHandler();
                Requester.Request('DELETE', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                    Test.ok(Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that DELETE /User/:Field/:ID/Memberships/:Membership requires a User to be logged in.");
                    CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                        Requester.Request('DELETE', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                            Test.ok(Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that DELETE /User/:Field/:ID/Memberships/:Membership requires special access privileges.");
                            CreateAndLogin(Requester, {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                                Requester.Request('DELETE', '/User/Username/123/Memberships/Test', function(Status, Body) {
                                    Test.ok(Body.ErrType === "BadField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Username') , "Confirming that DELETE /User/:Field/:ID/Memberships/:Membership validates ID.");
                                    Requester.Request('DELETE', '/User/Username/DoesNotExist/Memberships/Test', function(Status, Body) {
                                        Test.ok(Body.ErrType === "NoDeletion" && Body.ErrSource === "ExpressUser", "Confirming that DELETE /User/:Field/:ID/Memberships/:Membership passes non-existent user to express-user.");
                                        Requester.Request('PUT', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                                            Requester.Request('DELETE', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                                                Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, User) {
                                                    Test.ok(Status=== 200 && (!In(User.Memberships, 'Test')), "Confirming that membership deletion with sufficient privileges works");
                                                    Test.done();
                                                });
                                            }, {}, true);
                                        }, {}, true);
                                    }, {}, true);
                                }, {}, true);
                            }, true);
                        }, {}, true);
                    });
                }, {}, true);
            });
            break;
        case 'POST /User/Self/Recovery/:SetField':
            return(function(Test) {
                Test.expect(1);
                var Requester = new RequestHandler();
                CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                    Requester.Request('POST', '/User/Self/Recovery/DoesNotMatter', function(Status, Body) {
                        Test.ok(Body.ErrType === "NotValidated" && Body.ErrSource === "ExpressUser", "Confirming that the POST /User/Self/Recovery/:SetField route is disabled.");
                        Test.done();
                    }, {}, true);
                });
            });
            break;
    }
}

exports.BasicSetup = {
    'setUp': function(Callback) {
        var Schema = GetUserSchema();
        var ExpressUserLocalOptions = {'UserSchema': Schema};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Schema, Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'POST /Users': GetCoreTests('POST /Users', true),
    'PUT /Session/Self/User': GetCoreTests('PUT /Session/Self/User', true),
    'DELETE /Session/Self/User': GetCoreTests('DELETE /Session/Self/User', true),
    'GET /User/Self': GetCoreTests('GET /User/Self', true),
    'GET /User/:Field/:ID': GetCoreTests('GET /User/:Field/:ID', true),
    'PATCH /User/Self': GetCoreTests('PATCH /User/Self', true),
    'PATCH /User/:Field/:ID': GetCoreTests('PATCH /User/:Field/:ID', true),
    'DELETE /User/Self': GetCoreTests('DELETE /User/Self', true),
    'DELETE /User/:Field/:ID': GetCoreTests('DELETE /User/:Field/:ID', true),
    'GET /Users/:Field/:ID/Count': GetCoreTests('GET /Users/:Field/:ID/Count', true),
    'PUT /User/Self/Memberships/:Membership': function(Test) {
        Test.expect(7);
        var Requester = new RequestHandler();
        Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
            Test.ok(Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that PUT /User/Self/Memberships/Validated requires a User to be logged in.");
            CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                Requester.Request('PUT', '/User/Self/Memberships/Ah', function(Status, Body) {
                    Test.ok(Body.ErrType === "NotValidated" && Body.ErrSource === "ExpressUser", "Confirming that only the PUT /User/Self/Memberships/Validated is active for PUT /User/Self/Memberships/:Membership.");
                    Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
                        Test.ok(Body.ErrType === "BadBody" && Body.ErrSource === "ExpressUserLocal", "Confirming that only the PUT /User/Self/Memberships/Validated requires a User property in the body.");
                        Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
                            Test.ok(Body.ErrType === "NoAuth" && Body.ErrSource === "ExpressUserLocal", "Confirming that PUT /User/Self/Memberships/Validated requires email authentication."); 
                            Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
                                Test.ok(Body.ErrType === "BadField" && Body.ErrFields && In(Body.ErrFields, 'EmailToken'), "Confirming that PUT /User/Self/Memberships/Validated executes field validation properly.");
                                Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
                                    Test.ok(Body.ErrType === "NoInsertion" && Body.ErrSource === "ExpressUser", "Confirming that PUT /User/Self/Memberships/Validated convey incorrect authentication field to express-user.");
                                    Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, User) {
                                        Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
                                            Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, User) {
                                                Test.ok(Status === 200 && In(User.Memberships, 'Validated'), "Confirm that legitimate email validation works");
                                                Test.done();
                                            });
                                        }, {'User': {'EmailToken': User.EmailToken}}, true);
                                    });
                                }, {'User': {'EmailToken': 'abcdef'}}, true);
                            }, {'User': {'EmailToken': 'abc'}}, true);
                        }, {'User': {'Password': 'hahahihihoho', 'Email': 'ma@ma.ma'}}, true);
                    }, {}, true);
                }, {}, true);
            });
        }, {}, true);
    },
    'PUT /User/:Field/:ID/Memberships/:Membership': GetCoreTests('PUT /User/:Field/:ID/Memberships/:Membership', true),
    'DELETE /User/Self/Memberships/:Membership': GetCoreTests('DELETE /User/Self/Memberships/:Membership', true),
    'DELETE /User/:Field/:ID/Memberships/:Membership': GetCoreTests('DELETE /User/:Field/:ID/Memberships/:Membership', true),
    'POST /User/Self/Recovery/:SetField': GetCoreTests('POST /User/Self/Recovery/:SetField', true),
    'POST /User/:Field/:ID/Recovery/:SetField': function(Test) {
        Test.expect(7);
        var Requester = new RequestHandler();
        Requester.Request('POST', '/User/Username/Magnitus/Recovery/EmailToken', function(Status, Body) {
            Test.ok(Body.ErrType === "NoID" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /User/:Field/:ID/Recovery/:SetField requires Field to be private.");
            Requester.Request('POST', '/User/Password/hahahihihoho/Recovery/EmailToken', function(Status, Body) {
                Test.ok(Body.ErrType === "NoID" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /User/:Field/:ID/Recovery/:SetField requires Field to be ID.");
                Requester.Request('POST', '/User/Email/ma@ma.ma/Recovery/NoExist', function(Status, Body) {
                    Test.ok(Body.ErrType === "NoAuto" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /User/:Field/:ID/Recovery/:SetField requires SetField to be an existing field.");
                    Requester.Request('POST', '/User/Email/ma@ma.ma/Recovery/Age', function(Status, Body) {
                        Test.ok(Body.ErrType === "NoAuto" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /User/:Field/:ID/Recovery/:SetField requires SetField to be auto generated.");
                        Requester.Request('POST', '/User/Email/aaa/Recovery/EmailToken', function(Status, Body) {
                           Test.ok(Body.ErrType === "BadField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Email'), "Confirming that POST /User/:Field/:ID/Recovery/:SetField validates ID.");
                           Requester.Request('POST', '/User/Email/ma@ma.ma/Recovery/EmailToken', function(Status, Body) {
                               Test.ok(Body.ErrType === "NoUpdate" && Body.ErrSource === "ExpressUser", "Confirming that POST /User/:Field/:ID/Recovery/:SetField properly passed info on non-existent users to express-user which handles the error.");
                               CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                                   Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserBefore) {
                                       Requester.Request('POST', '/User/Email/ma@ma.ma/Recovery/EmailToken', function(Status, Body) {
                                           Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserAfter) {
                                               Test.ok(Status === 200 && UserBefore.EmailToken !== UserAfter.EmailToken, "Confirming that POST /User/:Field/:ID/Recovery/:SetField handles proper requests properly by passing them to express-user.");
                                               Test.done();
                                           });
                                       }, {}, true);
                                   });
                               });
                           }, {}, true);
                        }, {}, true);
                    }, {}, true);
                }, {}, true);
            }, {}, true);
        }, {}, true);
    },
    'EmailValidationAndUpdate': function(Test) {
        Test.expect(6);
        var Requester = new RequestHandler();
        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
            Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, User) {
                Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
                    Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserFirst) {
                        Test.ok(UserFirst && In(UserFirst.Memberships, 'Validated'), "Confirming that user is validated");
                        Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                            Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserSecond) {
                                Test.ok(UserSecond && In(UserSecond.Memberships, 'Validated') && UserFirst.EmailToken === UserSecond.EmailToken, "Confirming that PATCH /User/Self does not affect validation or email token when email is unchanged.");
                                Requester.Request('PATCH', '/User/Self', function(Status, Body) {
                                    Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserSecond) {
                                        Test.ok(UserSecond && !(In(UserSecond.Memberships, 'Validated')) && UserFirst.EmailToken !== UserSecond.EmailToken, "Confirming that PATCH /User/Self devalidates user and changes email token when email is changed.");
                                        Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
                                            Test.ok(Status===200, "Confirming that user is validated");
                                            Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                                                Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserThird) {
                                                    Test.ok(UserThird && In(UserThird.Memberships, 'Validated') && UserThird.EmailToken === UserSecond.EmailToken, "Confirming that PATCH /User/:Field/:ID does not affect validation or email token when email is unchanged.");
                                                    Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                                                        Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserFourth) {
                                                            Test.ok(UserFourth && (!In(UserFourth.Memberships, 'Validated')) && UserThird.EmailToken !== UserFourth.EmailToken, "Confirming that PATCH /User/:Field/:ID devalidates user and changes email token when email is changed.");
                                                            Test.done();
                                                        });
                                                    }, {'Update': {'Address': 'DoesNotMatter', 'Email': 'ma3@ma.ma'}}, true);
                                                });
                                            }, {'Update': {'Address': 'DoesNotMatter'}}, true);
                                        }, {'User': {'EmailToken': UserSecond.EmailToken}}, true);
                                    });
                                }, {'User': {'Password': 'hahahihihoho'}, 'Update': {'Address': 'DoesNotMatter', 'Email': 'ma2@ma.ma'}}, true);
                            });
                        }, {'User': {'Password': 'hahahihihoho'}, 'Update': {'Address': 'DoesNotMatter'}}, true);
                    });
                }, {'User': {'EmailToken': User.EmailToken}}, true);
            });
        }, true);
    }
};

exports.NoFieldHidingInViewSetup = {
    'setUp': function(Callback) {
        var Schema = GetUserSchema();
        var ExpressUserLocalOptions = {'UserSchema': GetUserSchema(), 'HideRestricted': false};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Schema, Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'GET /User/Self': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
            Requester.Request('GET', '/User/Self', function(Status, Body) {
                Test.ok(Body.Username==='Magnitus' && Body.Address === 'Vinvin du finfin' && Body.Email === 'ma@ma.ma' && Body.Gender === 'M' && Body.Age === 999 && Body.Password && Body.EmailToken && Body._id, "Confirming that GET /User/Self retrieves user from session and does not hide any field.");
                Test.done();
            }, {}, true);
        });
    },
    'GET /User/:Field/:ID': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
            Requester.Request('GET', '/User/Username/Magnitus', function(Status, Body) {
                Test.ok(Body.Username==='Magnitus' && Body.Address === 'Vinvin du finfin' && Body.Email === 'ma@ma.ma' && Body.Gender === 'M' && Body.Age === 999 && Body.Password && Body.EmailToken && Body._id, "Confirming that GET /User/Self retrieves user from session and does not hide any field.");
                Test.done();
            }, {}, true);
        }, true);
    }
}

exports.NoAdminSetup = {
    'setUp': function(Callback) {
        var Schema = GetUserSchema();
        var ExpressUserLocalOptions = {'UserSchema': Schema, 'Roles': null};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Schema, Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'PATCH /User/:Field/:ID': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
            Requester.Request('PATCH', '/User/Username/Magnitus', function(Status, Body) {
                Test.ok(Body.ErrType === "NotValidated" && Body.ErrSource === "ExpressUser", "Confirming that DELETE /User/:Field/:ID is not validated");
                Test.done();
            }, {'Update': {'Username': 'Magnitus2'}}, true);
        }, true);
    },
    'DELETE /User/:Field/:ID': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
            Requester.Request('DELETE', '/User/Username/Magnitus', function(Status, Body) {
                Test.ok(Body.ErrType === "NotValidated" && Body.ErrSource === "ExpressUser", "Confirming that DELETE /User/:Field/:ID is not validated");
                Test.done();
            }, {}, true);
        }, true);
    },
    'GET /User/:Field/:ID': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
            Requester.Request('GET', '/User/Username/Magnitus', function(Status, Body) {
                Test.ok(Body.ErrType === "NotValidated" && Body.ErrSource === "ExpressUser", "Confirming that GET /User/:Field/:ID is not validated");
                Test.done();
            }, {}, true);
        }, true);
    },
    'PUT /User/:Field/:ID/Memberships/:Membership': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
            Requester.Request('PUT', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                Test.ok(Body.ErrType === "NotValidated" && Body.ErrSource === "ExpressUser", "Confirming that PUT /User/:Field/:ID/Memberships/:Membership is not validated");
                Test.done();
            }, {}, true);
        }, true);
    },
    'DELETE /User/:Field/:ID/Memberships/:Membership': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
            Requester.Request('DELETE', '/User/Username/Magnitus/Memberships/Test', function(Status, Body) {
                Test.ok(Body.ErrType === "NotValidated" && Body.ErrSource === "ExpressUser", "Confirming that DELETE /User/:Field/:ID/Memberships/:Membership is not validated");
                Test.done();
            }, {}, true);
        }, true);
    }
}

function GenerateRouteTests(RouteVar, UseRoute, DoesntUseRoute)
{
    return(function(Test) {
        var Requester = new RequestHandler();
        Test.expect(UseRoute.length+DoesntUseRoute.length);
        var Calls = [];
        UseRoute.forEach(function(Item) {
            Calls.push(function(Callback) {
                Requester.Request(Item['Method'], Item['Url'], function(Status, Body) {
                    Test.ok(Body[RouteVar], "Confirming that "+RouteVar+" route gets applied to "+Item['Method']+" "+Item['Url']+" route.");
                    Callback();
                }, {}, true);
            });
        });
        DoesntUseRoute.forEach(function(Item) {
            Calls.push(function(Callback) {
                Requester.Request(Item['Method'], Item['Url'], function(Status, Body) {
                    Test.ok(!Body[RouteVar], "Confirming that "+RouteVar+" route does not get applied to "+Item['Method']+" "+Item['Url']+" route.");
                    Callback();
                }, {}, true);
            });
        });
        Nimble.parallel(Calls, function(Err) {Test.done();});
    });
}

var BruteRoutes = [{'Method': 'PATCH', 'Url': '/User/Self'}, {'Method': 'DELETE', 'Url': '/User/Self'}, {'Method': 'PUT', 'Url': '/Session/Self/User'}, {'Method': 'PUT', 'Url': '/User/Self/Memberships/Validated'}, {'Method': 'POST', 'Url': '/Users'}, {'Method': 'POST', 'Url': '/User/Email/donotcare@ca.ca/Recovery/Password'}];
var NoBruteRoutes = [{'Method': 'GET', 'Url': '/User/Self'}, {'Method': 'DELETE', 'Url': '/Session/Self/User'}, {'Method': 'GET', 'Url': '/Users/Username/Magnitus/Count'}, {'Method': 'PATCH', 'Url': '/User/Username/Magnitus'}, {'Method': 'DELETE', 'Url': '/User/Username/Magnitus'}, {'Method': 'GET', 'Url': '/User/Username/Magnitus'}, {'Method': 'PUT', 'Url': '/User/Username/Magnitus/Memberships/Admin'}, {'Method': 'DELETE', 'Url': '/User/Username/Magnitus/Memberships/Admin'}];

exports.BruteRouteSetup = {
    'setUp': function(Callback) {
        var Schema = GetUserSchema();
        var ExpressUserLocalOptions = {'UserSchema': Schema, 'BruteForceRoute': FakeBrute};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRouteFake, SuccessRouteFakeErr], Schema, Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'Main': GenerateRouteTests('Brute', BruteRoutes, NoBruteRoutes)
}

var CsrfRoutes = [{'Method': 'PUT', 'Url': '/Session/Self/User'}, {'Method': 'DELETE', 'Url': '/Session/Self/User'}, {'Method': 'PATCH', 'Url': '/User/Username/Magnitus'}, {'Method': 'DELETE', 'Url': '/User/Username/Magnitus'}, {'Method': 'PUT', 'Url': '/User/Username/Magnitus/Memberships/Admin'}, {'Method': 'DELETE', 'Url': '/User/Username/Magnitus/Memberships/Admin'}, {'Method': 'POST', 'Url': '/User/Email/donotcare@ca.ca/Recovery/Password'}];
var NoCsrfRoutes = [{'Method': 'GET', 'Url': '/User/Self'}, {'Method': 'PATCH', 'Url': '/User/Self'}, {'Method': 'DELETE', 'Url': '/User/Self'}, {'Method': 'POST', 'Url': '/Users'}, {'Method': 'GET', 'Url': '/Users/Username/Magnitus/Count'}, {'Method': 'GET', 'Url': '/User/Username/Magnitus'}, {'Method': 'PUT', 'Url': '/User/Self/Memberships/Validated'}];

exports.CsrfRouteSetup = {
    'setUp': function(Callback) {
        var Schema = GetUserSchema();
        var ExpressUserLocalOptions = {'UserSchema': Schema, 'CsrfRoute': FakeCsrf};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRouteFake, SuccessRouteFakeErr], Schema, Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'Main': GenerateRouteTests('Csrf', CsrfRoutes, NoCsrfRoutes)
}

var MaxCsrfRoutes = [{'Method': 'PUT', 'Url': '/Session/Self/User'}, {'Method': 'DELETE', 'Url': '/Session/Self/User'}, {'Method': 'PATCH', 'Url': '/User/Username/Magnitus'}, {'Method': 'DELETE', 'Url': '/User/Username/Magnitus'}, {'Method': 'PUT', 'Url': '/User/Username/Magnitus/Memberships/Admin'}, {'Method': 'DELETE', 'Url': '/User/Username/Magnitus/Memberships/Admin'}, {'Method': 'PUT', 'Url': '/User/Self/Memberships/Validated'}, {'Method': 'POST', 'Url': '/User/Email/donotcare@ca.ca/Recovery/Password'}, {'Method': 'PATCH', 'Url': '/User/Self'}, {'Method': 'DELETE', 'Url': '/User/Self'}, {'Method': 'POST', 'Url': '/Users'}];
var MaxNoCsrfRoutes = [{'Method': 'GET', 'Url': '/User/Self'}, {'Method': 'GET', 'Url': '/Users/Username/Magnitus/Count'}, {'Method': 'GET', 'Url': '/User/Username/Magnitus'}];

exports.NonMinimalCsrfRouteSetup = {
    'setUp': function(Callback) {
        var Schema = GetUserSchema();
        var ExpressUserLocalOptions = {'UserSchema': Schema, 'CsrfRoute': FakeCsrf, 'MinimalCsrf': false};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRouteFake, SuccessRouteFakeErr], Schema, Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'Main': GenerateRouteTests('Csrf', MaxCsrfRoutes, MaxNoCsrfRoutes)
}

exports.NoEmailVerificationSetup = {
    'setUp': function(Callback) {
        var Schema = GetUserSchema(true);
        var ExpressUserLocalOptions = {'UserSchema': Schema};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Schema, Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'POST /Users': GetCoreTests('POST /Users', false),
    'PUT /Session/Self/User': GetCoreTests('PUT /Session/Self/User', false),
    'DELETE /Session/Self/User': GetCoreTests('DELETE /Session/Self/User', false),
    'GET /User/Self': GetCoreTests('GET /User/Self', false),
    'GET /User/:Field/:ID': GetCoreTests('GET /User/:Field/:ID', false),
    'PATCH /User/Self': GetCoreTests('PATCH /User/Self', false),
    'PATCH /User/:Field/:ID': GetCoreTests('PATCH /User/:Field/:ID', false),
    'DELETE /User/Self': GetCoreTests('DELETE /User/Self', false),
    'DELETE /User/:Field/:ID': GetCoreTests('DELETE /User/:Field/:ID', false),
    'GET /Users/:Field/:ID/Count': GetCoreTests('GET /Users/:Field/:ID/Count', false),
    'PUT /User/Self/Memberships/:Membership': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        Requester.Request('PUT', '/User/Self/Memberships/Validated', function(Status, Body) {
            Test.ok(Body.ErrType && Body.ErrType === 'NotValidated' && Body.ErrSource === 'ExpressUser', "Confirming that PUT /User/Self/Memberships/Validated route is not validated when there is no email authentication.");
            Test.done();
        }, {}, true);
    },
    'PUT /User/:Field/:ID/Memberships/:Membership': GetCoreTests('PUT /User/:Field/:ID/Memberships/:Membership', false),
    'DELETE /User/Self/Memberships/:Membership': GetCoreTests('DELETE /User/Self/Memberships/:Membership', false),
    'DELETE /User/:Field/:ID/Memberships/:Membership': GetCoreTests('DELETE /User/:Field/:ID/Memberships/:Membership', false),
    'POST /User/Self/Recovery/:SetField': GetCoreTests('POST /User/Self/Recovery/:SetField', false),
    'POST /User/:Field/:ID/Recovery/:SetField': function(Test) {
        Test.expect(7);
        var Requester = new RequestHandler();
        Requester.Request('POST', '/User/Username/Magnitus/Recovery/Password', function(Status, Body) {
            Test.ok(Body.ErrType === "NoID" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /User/:Field/:ID/Recovery/:SetField requires Field to be private.");
            Requester.Request('POST', '/User/Password/hahahihihoho/Recovery/Password', function(Status, Body) {
                Test.ok(Body.ErrType === "NoID" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /User/:Field/:ID/Recovery/:SetField requires Field to be ID.");
                Requester.Request('POST', '/User/Email/ma@ma.ma/Recovery/NoExist', function(Status, Body) {
                    Test.ok(Body.ErrType === "NoAuto" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /User/:Field/:ID/Recovery/:SetField requires SetField to be an existing field.");
                    Requester.Request('POST', '/User/Email/ma@ma.ma/Recovery/Age', function(Status, Body) {
                        Test.ok(Body.ErrType === "NoAuto" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /User/:Field/:ID/Recovery/:SetField requires SetField to be auto generated.");
                        Requester.Request('POST', '/User/Email/aaa/Recovery/Password', function(Status, Body) {
                           Test.ok(Body.ErrType === "BadField" && Body.ErrSource === "ExpressUserLocal" && Body.ErrFields && In(Body.ErrFields, 'Email'), "Confirming that POST /User/:Field/:ID/Recovery/:SetField validates ID.");
                           Requester.Request('POST', '/User/Email/ma@ma.ma/Recovery/Password', function(Status, Body) {
                               Test.ok(Body.ErrType === "NoUpdate" && Body.ErrSource === "ExpressUser", "Confirming that POST /User/:Field/:ID/Recovery/:SetField properly passed info on non-existent users to express-user which handles the error.");
                               CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                                   Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserBefore) {
                                       Requester.Request('POST', '/User/Email/ma@ma.ma/Recovery/Password', function(Status, Body) {
                                           Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, UserAfter) {
                                               Test.ok(Status === 200 && UserBefore.Password !== UserAfter.Password, "Confirming that POST /User/:Field/:ID/Recovery/:SetField handles proper requests properly by passing them to express-user.");
                                               Test.done();
                                           });
                                       }, {}, true);
                                   });
                               });
                           }, {}, true);
                        }, {}, true);
                    }, {}, true);
                }, {}, true);
            }, {}, true);
        }, {}, true);
    }
}

exports.NumericalParamsSetup = {
}

exports.ConnectionSecurity = {
    'setUp': function(Callback) {
        var Schema = GetUserSchema();
        var ExpressUserLocalOptions = {'UserSchema': Schema, 'BruteForceRoute': FakeBrute, 'CsrfRoute': FakeCsrf, 'ConnectionSecurity': function() {return false;}};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Schema, Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'Main': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        Requester.Request('POST', '/Users', function(Status, Body) {
            Test.ok(Body.ErrType === "InsecureConnection" && Body.ErrSource === "ExpressUserLocal", "Making Sure that connection security route works");
            Test.done();
        }, {}, true);
    }
};
