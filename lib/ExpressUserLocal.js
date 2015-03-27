//Copyright (c) 2015 Eric Vallee <eric_vallee2003@yahoo.ca>
//MIT License: https://raw.githubusercontent.com/Magnitus-/ExpressUserLocal/master/License.txt

//TODO:
//Put send email after successful account insertion in database (pass object with hook callbacks)
//Don't just check for User/Update existence in response object, verify that they are object

var Uid = require('uid-safe').sync;
var UserProperties = require('user-properties');
var AccessControl = require('express-access-control');
var EmailRegex = require('regex-email');
var UsernameRegex = new RegExp("^[a-zA-Z][\\w\\+\\-\\.]{0,19}$");
var PasswordRegex = new RegExp("^.{8,20}$");

var ValidationRoutes = {};

ValidationRoutes['GetUserSession'] = function(UserSchema, NeedAuth) {
    var LoginFields = UserSchema.ListLogin();
    var AuthFields = UserSchema.ListAuth('User');
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        if(Req.session&&Req.session.User&&LoginFields.length>0)
        {
            Locals.ExpressUser = {'User': {}};
            Locals.ExpressUser['User'][LoginFields[0]] = Req.session.User[LoginFields[0]];
            var AuthPresent = false;
            var AuthOk = false;
            if(Req.body.User&&NeedAuth)
            {
                AuthOk = AuthFields.every(function(Field, Index, List) {
                    if(typeof(Req.body.User[Field])!='undefined')
                    {
                        AuthPresent = true;
                        Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                        return UserSchema.Validate(Field, Req.body.User[Field]);
                    }
                    else
                    {
                        return true;
                    }
                });
            }
            if((AuthPresent&&AuthOk) || (!NeedAuth))
            {
                Next();
                return;
            }
        }
        Res.status(400).end();     
    });
};

ValidationRoutes['GetUserURL'] = function(UserSchema, PrivateOnly) {
    var IdFields = UserSchema.ListID();
    if(PrivateOnly)
    {
        IdFields = UserProperties.ListIntersection(IdFields, UserSchema.List('Privacy', UserProperties.Privacy.Private));
    }
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        var IdPresent = false;
        var IdOk = IdFields.every(function(Field, Index, List) {
            if(Req.params['Field']==Field)
            {
                IdPresent = true;
                Locals.ExpressUser['User'][Field]=Req.params['ID'];
                return UserSchema.Validate(Field, Req.params['ID']);
            }
            else
            {
                return true;
            }
        });
        if(IdOk&&IdPresent)
        {
            Next();
            return;
        }
        Res.status(400).end();
    });
};

ValidationRoutes['GetUserBody'] = function(UserSchema) {
    var LoginFields = UserSchema.ListLogin();
    var AuthFields = UserSchema.ListAuth('User');
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        var LoginPresent = false;
        var LoginOk = false;
        var AuthPresent = false;
        var AuthOk = false;
        if(Req.body.User)
        {
            LoginOk = LoginFields.every(function(Field, Index, List) {
                if(typeof(Req.body.User[Field])!='undefined')
                {
                    LoginPresent = true;
                    Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                    return UserSchema.Validate(Field, Req.body.User[Field]);
                }
                else
                {
                    return true;
                }
            });
            var AuthOk = AuthFields.every(function(Field, Index, List) {
                if(typeof(Req.body.User[Field])!='undefined')
                {
                    AuthPresent = true;
                    Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                    return UserSchema.Validate(Field, Req.body.User[Field]);
                }
                else
                {
                    return true;
                }
            });
        }
        if(LoginPresent&&LoginOk&&AuthPresent&&AuthOk)
        {
            Next();
            return;
        }
        Res.status(400).end();
    });
}

ValidationRoutes['UsersPOST'] = function(UserSchema) {
    var AccessibleFields = UserSchema.List('Access', 'User');
    var ReqRegField = UserProperties.ListIntersection(UserSchema.List('Required', true), AccessibleFields);
    var OptRegField = UserProperties.ListIntersection(UserSchema.List('Required', false), AccessibleFields);
    var EmailAuthFields = UserSchema.ListAuth('Email');
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        var RequiredOk = false;
        var NotRequiredOk = false;
        if(Req.body.User)
        {
            RequiredOk = ReqRegField.every(function(Field, Index, List) {
                Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                return UserSchema.Validate(Field, Req.body.User[Field]);
            });
            NotRequiredOk = OptRegField.every(function(Field, Index, List) {
                if(typeof(Req.body.User[Field])!='undefined')
                {
                    Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                    return UserSchema.Validate(Req.body.User[Field]);
                }
                else
                {
                    return true;
                }
            });
        }
        if(RequiredOk&&NotRequiredOk)
        {
            if(EmailAuthFields.length>0)
            {
                UserSchema.Generate(EmailAuthFields[0], function(Err, EmailToken) {
                    if(Err)
                    {
                        Next(Err);
                        return;
                    }
                    Locals.ExpressUser['User'][EmailAuthFields[0]] = EmailToken;
                    Next();
                });
            }
            else
            {
                Next();
            }
            
        }
        else
        {
            Res.status(400).end();
        }
    });
};

ValidationRoutes['UserPATCH'] = function(UserSchema, EditPrivileges) {
    var EditableFields = UserSchema.ListEditable('User');
    var RestrictedFields = UserSchema.ListComplement(EditableFields);
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        var UpdateSomething = false;
        Locals.ExpressUser['Update'] = {};
        
        var UpdateSomething = false;
        var EditableOk = true;
        var ConstantOk = true; 
        if(Req.body.Update)
        {
            EditableOk = EditableFields.every(function(Field, Index, List) {
                if(typeof(Req.body.Update[Field])!='undefined')
                {
                    UpdateSomething = true;
                    Locals.ExpressUser['Update'][Field] = Req.body.Update[Field];
                    return UserSchema.Validate(Field, Req.body.Update[Field]);
                }
                else
                {
                    return true;
                }
            });
            
            if(EditPrivileges)
            {
                ConstantOk = RestrictedFields.every(function(Field, Index, List) {
                    if(typeof(Req.body.Update[Field])!='undefined')
                    {
                        UpdateSomething = true;
                        Locals.ExpressUser['Update'][Field] = Req.body.Update[Field];
                        return UserSchema.Validate(Field, Req.body.Update[Field]);
                    }
                    else
                    {
                        return true;
                    }
                });
            }
        }
        
        if(UpdateSomething&&ConstantOk&&EditableOk)
        {
            Next();
            return;
        }
        Res.status(400).end();
    });
};

ValidationRoutes['UsersCountGET'] = function(UserSchema, Roles) {
    var PublicFields = UserSchema.List('Privacy', UserProperties.Privacy.Public);
    var GetUserURLRoute = ValidationRoutes['GetUserURL'](UserSchema);
    return(function(Req, Res, Next) {
        var IsPublic = PublicFields.some(function(Item, Index, List) {
            return Item==Req.params.Field;
        });
        if(IsPublic||AccessControl.Authenticate(Req, Res, Roles.Get))
        {
            GetUserURLRoute(Req, Res, Next);
            return;
        }
        Res.status(401).end();
    });
};

ValidationRoutes['UserMembershipsVerifiedPUT'] = function(UserSchema) {
    var EmailAuthFields = UserSchema.ListAuth('Email');
    return(function(Req, Res, Next) {
        if(Req.body.User)
        {
            var AuthOk = true;
            AuthOk = EmailAuthFields.some(function(Field, Index, List) {
                return Req.body.User[Field] === Req.session.User[Field];
            });
            if(AuthOk)
            {
                Res.locals.ExpressUser['Membership'] = 'Validated';
                Next();
                return;
            }
            Res.status(401).end();
        }
        Res.status(400).end();
    });
};

ValidationRoutes['UserGET'] = function(UserSchema, HideSecret) {
    var SecretFields = UserSchema.List('Privacy', UserProperties.Privacy.Secret);
    return(function(Req, Res, Next) {
        if(Res.locals.ExpressUser && HideSecret)
        {
            Res.locals.ExpressUser['Hide'] = SecretFields;
        }
        Next();
    });
};

ValidationRoutes['UserPOST'] = function(UserSchema) {
    var EditableFields = UserProperties.ListUnion(UserSchema.ListEditable('User'), UserSchema.ListEditable('Email'));
    var PostFields = UserProperties.ListIntersection(UserSchema.ListGeneratable(), EditableFields);
    return(function(Req, Res, Next) {
        var PostFieldsOk = true;
        var SetField = null;
        PostFieldsOk = PostFields.some(function(Field, Index, List) {
            if(Req.params['SetField'] === Field)
            {
                SetField = Field;
            }
            return(Req.params['SetField'] === Field);
        });
        if(PostFieldsOk)
        {
            Locals.ExpressUser['Update'] = {};
            UserSchema.Generate(SetField, function(Err, GeneratedVal) {
                if(Err)
                {
                    Res.status(500).end();
                }
                else
                {
                    Locals.ExpressUser['Update'][SetField] = GeneratedVal;
                    Next();
                }
            });
            return;
        }
        Res.status(400).end();
    });
};
    
module.exports = function(Options)
{
    var Verifications = {};
    Verifications['Email'] = Options && Options.EmailRegex ? Options.EmailRegex : EmailRegex;
    Verifications['Username'] = Options && Options.UsernameRegex ? Options.UsernameRegex : UsernameRegex;
    Verifications['Password'] = Options && Options.PasswordRegex ? Options.PasswordRegex : PasswordRegex;
    var BruteForceRoute = Options && Options.BruteForceRoute ? Options.BruteForceRoute : null;
    var CsrfRoute = Options && Options.CsrfRoute ? Options.CsrfRoute : null;
    var MinimalCsrf = Options && Options.MinimalCsrf ? Options.MinimalCsrf : true;
    var HideSecret = Options && Options.HideSecret ? Options.HideSecret : true;
    var UserSchema = Options && Options.UserSchema ? Options.UserSchema : {
    'Username': {
        'Required': true,
        'Unique': true,
        'Mutable': false,
        'Description': function(Value) {return (typeof(Value)!='undefined')&&Verifications['Username'].test(Value)}
    },
    'Email': {
        'Required': true,
        'Unique': true,
        'Privacy': UserProperties.Privacy.Private,
        'Description': function(Value) {return (typeof(Value)!='undefined')&&Verifications['Email'].test(Value)}
    },
    'Password': {
        'Required': true,
        'Privacy': UserProperties.Privacy.Secret,
        'Retrievable': false,
        'Description': function(Value) {return (typeof(Value)!='undefined')&&Verifications['Password'].test(Value)},
        'Sources': ['User', 'Auto'],
        'Generator': function(Callback) {Callback(null, Uid(15));}
    },
    'EmailToken': {
        'Required': true,
        'Privacy': UserProperties.Privacy.Secret,
        'Retrievable': false,
        'Access': 'Email',
        'Sources': ['Auto'],
        'Generator': function(Callback) {Callback(null, Uid(20));}
    }};
    
    UserSchema = UserProperties(UserSchema);
    
    return function(Router, Roles) {
        if(BruteForceRoute)
        {
            Router.patch('/User/Self', BruteForceRoute);
            Router.delete('/User/Self', BruteForceRoute);
            Router.put('/Session/Self/User', BruteForceRoute);
            Router.put('/User/Self/Memberships/Validated', BruteForceRoute);
            Router.post('/User/:Field/:ID/:SetField', BruteForceRoute);
        }
        
        if(CsrfRoute)
        {
            Router.patch('/User/:Field/:ID', CsrfRoute);
            Router.delete('/User/:Field/:ID', CsrfRoute);
            Router.put('/Session/Self/User', CsrfRoute);
            Router.delete('/Session/Self/User', CsrfRoute);
            Router.put('/User/Self/Memberships/Validated', CsrfRoute);
            Router.post('/User/:Field/:ID/:SetField', CsrfRoute);
        }
        
        if(CsrfRoute&&(!MinimalCsrf))
        {
            Router.post('/Users', CsrfRoute);
            Router.patch('/User/Self', CsrfRoute);
            Router.delete('/User/Self', CsrfRoute);
        }
        
        Router.post('/Users', ValidationRoutes.UsersPOST(UserSchema));
        Router.get('/Users/:Field/:ID/Count', ValidationRoutes.UsersCountGET(UserSchema, Roles));
        
        Router.patch('/User/Self', ValidationRoutes.GetUserSession(UserSchema, true));
        Router.patch('/User/Self', ValidationRoutes.UserPATCH(UserSchema, false));
        Router.patch('/User/:Field/:ID', ValidationRoutes.GetUserURL(UserSchema));
        Router.patch('/User/:Field/:ID', ValidationRoutes.UserPATCH(UserSchema, true));
        
        Router.delete('/User/Self', ValidationRoutes.GetUserSession(UserSchema, true));
        Router.delete('/User/:Field/:ID', ValidationRoutes.GetUserURL(UserSchema));
        
        Router.get('/User/Self', ValidationRoutes.GetUserSession(UserSchema, false));
        Router.get('/User/Self', ValidationRoutes.UserGET(UserSchema, HideSecret));
        Router.get('/User/:Field/:ID', ValidationRoutes.GetUserURL(UserSchema));
        Router.get('/User/:Field/:ID', ValidationRoutes.UserGET(UserSchema, HideSecret));
        
        Router.post('/User/:Field/:ID/:SetField', ValidationRoutes.GetUserURL(UserSchema, true));
        Router.post('/User/:Field/:ID/:SetField', ValidationRoutes.UserPOST(UserSchema));
        
        Router.put('/Session/Self/User', ValidationRoutes.GetUserBody(UserSchema));
        
        Router.put('/User/Self/Memberships/Validated', ValidationRoutes.GetUserSession(UserSchema, false));
        Router.put('/User/Self/Memberships/Validated', ValidationRoutes.UserMembershipsVerifiedPUT(UserSchema));
    };
}
