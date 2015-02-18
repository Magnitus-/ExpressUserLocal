//Copyright (c) 2015 Eric Vallee <eric_vallee2003@yahoo.ca>
//MIT License: https://raw.githubusercontent.com/Magnitus-/ExpressUserLocal/master/License.txt

var UserProperties = require('user-properties');
var AccessControl = require('express-access-control');
var EmailRegex = require('regex-email');
var UsernameRegex = new RegExp("^[a-zA-Z][\\w\\+\\-\\.]{0,19}$");
var PasswordRegex = new RegExp("^.{8,20}$");

var ValidationRoutes = {};

ValidationRoutes['GetUserSession'] = function(UserSchema, NeedAuth) {
    var LoginFields = UserSchema.GenLogin();
    var AuthFields = UserSchema.GenAuth();
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

ValidationRoutes['GetUserURL'] = function(UserSchema) {
    var IdFields = UserSchema.GenIdentify();
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
    var LoginFields = UserSchema.GenLogin();
    var AuthFields = UserSchema.GenAuth();
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
    var RequiredFields = UserSchema.GenRequired();
    var NotRequiredFields = UserSchema.GenComplement(RequiredFields);
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        var RequiredOk = false;
        var NotRequiredOk = false;
        if(Req.body.User)
        {
            RequiredOk = RequiredFields.every(function(Field, Index, List) {
                Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                return UserSchema.Validate(Field, Req.body.User[Field]);
            });
            NotRequiredOk = NotRequiredFields.every(function(Field, Index, List) {
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
            Next();
            return;
        }
        Res.status(400).end();
    });
};

ValidationRoutes['UserPATCH'] = function(UserSchema, EditPrivileges) {
    var EditableFields = UserSchema.GenEditable();
    var ConstantFields = UserSchema.GenComplement(EditableFields);
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
                ConstantOk = ConstantFields.every(function(Field, Index, List) {
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
    var PublicFields = UserSchema.GenPublic();
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

module.exports = function(Options)
{
    var Verifications = {};
    Verifications['Email'] = Options && Options.EmailRegex ? Options.EmailRegex : EmailRegex;
    Verifications['Username'] = Options && Options.UsernameRegex ? Options.UsernameRegex : UsernameRegex;
    Verifications['Password'] = Options && Options.PasswordRegex ? Options.PasswordRegex : PasswordRegex;
    var BruteForceRoute = Options && Options.BruteForceRoute ? Options.BruteForceRoute : null;
    var CsrfRoute = Options && Options.CsrfRoute ? Options.CsrfRoute : null;
    var MinimalCsrf = Options && Options.MinimalCsrf ? Options.MinimalCsrf : true;
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
        'Private': true,
        'Description': function(Value) {return (typeof(Value)!='undefined')&&Verifications['Email'].test(Value)}
    },
    'Password': {
        'Required': true,
        'Private': true,
        'Secret': true,
        'Retrievable': false,
        'Description': function(Value) {return (typeof(Value)!='undefined')&&Verifications['Password'].test(Value)}
    }};
    
    UserSchema = UserProperties(UserSchema);
    
    return function(Router, Roles) {
        if(BruteForceRoute)
        {
            Router.patch('/User/Self', BruteForceRoute);
            Router.delete('/User/Self', BruteForceRoute);
            Router.put('/Session/Self/User', BruteForceRoute);
        }
        
        if(CsrfRoute)
        {
            Router.patch('/User/:Field/:ID', CsrfRoute);
            Router.delete('/User/:Field/:ID', CsrfRoute);
            Router.put('/Session/Self/User', CsrfRoute);
            Router.delete('/Session/Self/User', CsrfRoute);
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
        Router.get('/User/:Field/:ID', ValidationRoutes.GetUserURL(UserSchema));
        
        Router.put('/Session/Self/User', ValidationRoutes.GetUserBody(UserSchema));
    };
}
