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

function Setup(ValidationHandler, ResponseRoutes, Callback)
{
    var UserSchema = GetUserSchema();
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
                        Res.status(400).json(ErrBody);
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
            Res.locals.ExpressUser.Hide.forEach(function(ToHide) {
                delete Res.locals.ExpressUser.Result[ToHide];
            });
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

function GetUserSchema()
{
    var UserSchema = UserProperties({'Username': {
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
                      'Generator': function(Callback) {Callback(null, Uid(20));}
                  },
                  '_id': {
                      'Privacy': UserProperties.Privacy.Private,
                      'Access': 'System',
                      'Sources': ['MongoDB']
                  }});
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

exports.BasicSetup = {
    'setUp': function(Callback) {
        var ExpressUserLocalOptions = {'UserSchema': GetUserSchema()};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'POST /Users': function(Test) {
        Test.expect(7);
        var Requester = new RequestHandler();
        Requester.Request('POST', '/Users', function(Status, Body) {
            Test.ok(Body.ErrType && Body.ErrType === "BadBody" && Body.ErrSource === "ExpressUserLocal", "Confirming that POST /Users require a User property in the body.");
            Requester.Request('POST', '/Users', function(Status, Body) {
                Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === "BadField" && Body.ErrFields.length === 1 && In(Body.ErrFields, 'Address'), "Confirming that POST /Users requires required fields to be defined.");
                Requester.Request('POST', '/Users', function(Status, Body) {
                    Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === "BadField" && Body.ErrFields.length === 2 && In(Body.ErrFields, 'Address', 'Password'), "Confirming that POST /Users requires required fields to be not null.");
                    Requester.Request('POST', '/Users', function(Status, Body) {
                        Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === "BadField" && Body.ErrFields.length === 3 && In(Body.ErrFields, 'Username', 'Email', 'Password'), "Confirming that POST /Users requires required fields to pass validation.");
                        Requester.Request('POST', '/Users', function(Status, Body) {
                            Context.UserStore.Get({'Username': 'Magnitus'}, function(Err, User) {
                                Test.ok(Status===200 && User.Username==='Magnitus' && User.Email === 'ma@ma.ma' && User.EmailToken, "Confirming that POST /Users with only required fields work and that email authentication is generated.")
                                Requester.Request('POST', '/Users', function(Status, Body) {
                                    Test.ok(Body.ErrType && Body.ErrFields && Body.ErrType === "BadField" && Body.ErrFields.length === 2 && In(Body.ErrFields, 'Gender', 'Age'), "Confirming that POST /Users requires non-required fields, if present, to pass validation.");
                                    Requester.Request('POST', '/Users', function(Status, Body) {
                                        Context.UserStore.Get({'Username': 'Magnitus2'}, function(Err, User) {
                                            Test.ok(Status===200 && User.Gender === 'M' && User.Age === 999, "Confirming that non-required fields are inserted for POST /Users and that the request validates if all fields validate.");
                                            Test.done();
                                        });
                                    }, {'User': {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}}, true);
                                }, {'User': {'Username': 'Magnitus2', 'Email': 'ma2@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'It', 'Age': -10}}, true);
                            });
                        }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin'}}, true );
                    }, {'User': {'Username': '12Magnitus', 'Email': 'ma', 'Password': '1', 'Address': 'Vinvin du finfin'}}, true);
                }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': null, 'Address': null}}, true);
            }, {'User': {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho'}}, true);
        }, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho'}, true);
    },
    'PUT /Session/Self/User': function(Test) {
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
    },
    'DELETE /Session/Self/User': function(Test) {
        Test.expect(1);
        var Requester = new RequestHandler();
        Requester.Request('DELETE', '/Session/Self/User', function(Status, Body) {
            Test.ok(Body.ErrType && Body.ErrType === "NoSessionUser" && Body.ErrSource === "ExpressUser", "Confirming that DELETE /Session/Self/User request is passed to express-user.");
            Test.done();
        }, {}, true);
    },
    'GET /User/Self': function(Test) {
        Test.expect(2);
        var Requester = new RequestHandler();
        Requester.Request('GET', '/User/Self', function(Status, Body) {
            Test.ok(Body.ErrType && Body.ErrType === "NoAccess" && Body.ErrSource === "ExpressAccessControl", "Confirming that GET /User/Self requires the user to be looged in.");
            CreateAndLogin(Requester, {'Username': 'Magnitus', 'Email': 'ma@ma.ma', 'Password': 'hahahihihoho', 'Address': 'Vinvin du finfin', 'Gender': 'M', 'Age': 999}, function() {
                Requester.Request('GET', '/User/Self', function(Status, Body) {
                    Test.ok(Body.Username==='Magnitus' && Body.Address === 'Vinvin du finfin' && Body.Email === 'ma@ma.ma' && Body.Gender === 'M' && Body.Age === 999 && (!Body.Password) && (!Body.EmailToken) && (!Body._id), "Confirming that GET /User/Self retrieves user from session and specifies the right fields to hide.");
                    Test.done();
                }, {}, true);
            }, false);
        }, {}, true);
    },
    'GET /User/:Field/:ID': function(Test) {
        Test.expect(0);
        Test.done();
    }
};

exports.NoFieldHidingInViewSetup = {
    'setUp': function(Callback) {
        var ExpressUserLocalOptions = {'UserSchema': GetUserSchema(), 'HideSecret': false};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'GET /User/Self': function(Test) {
        Test.expect(0);
        Test.done();
    },
    'GET /User/:Field/:ID': function(Test) {
        Test.expect(0);
        Test.done();
    }
}

exports.NoAdminSetup = {
    'setUp': function(Callback) {
        var ExpressUserLocalOptions = {'UserSchema': GetUserSchema(), 'Roles': null};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'PATCH /User/:Field/:ID': function(Test) {
        Test.expect(0);
        Test.done();
    },
    'DELETE /User/:Field/:ID': function(Test) {
        Test.expect(0);
        Test.done();
    },
    'GET /User/:Field/:ID': function(Test) {
        Test.expect(0);
        Test.done();
    },
    'PUT /User/:Field/:ID/Memberships/:Membership': function(Test) {
        Test.expect(0);
        Test.done();
    },
    'DELETE /User/:Field/:ID/Memberships/:Membership': function(Test) {
        Test.expect(0);
        Test.done();
    }
}

exports.BruteRouteSetup = {
}

exports.CrsfRouteSetup = {
}

exports.NonMinimalCrsfRouteSetup = {
}

exports.NoEmailVerificationSetup = {
}

exports.ConnectionSecurity = {
    'setUp': function(Callback) {
        var ExpressUserLocalOptions = {'BruteForceRoute': FakeBrute, 'CsrfRoute': FakeCrsf, 'ConnectionSecurity': function() {return false;}};
        Setup(ExpressUserLocal(ExpressUserLocalOptions), [SuccessRoute], Callback);
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


/*exports.Default = {
    'setUp': function(Callback) {
        Setup([BodyRoute], [SuccessRoute], Callback);
    },
    'tearDown': function(Callback) {
        TearDown(Callback);
    },
    'Registration': function(Callback) {
    },
    'SessionExistenceCheck': function(Test) {
        Test.expect(6);
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
        }, null, true);
    }}*/
