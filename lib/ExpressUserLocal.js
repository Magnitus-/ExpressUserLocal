//Copyright (c) 2015 Eric Vallee <eric_vallee2003@yahoo.ca>
//MIT License: https://raw.githubusercontent.com/Magnitus-/ExpressUserLocal/master/License.txt

var Uid = require('uid-safe').sync;
var UserProperties = require('user-properties');
var AccessControl = require('express-access-control');
var EmailRegex = require('regex-email');
var UsernameRegex = new RegExp("^[a-zA-Z][\\w\\+\\-\\.]{0,19}$");
var PasswordRegex = new RegExp("^.{8,20}$");

var ValidationRoutes = {};

function ConnectionCheckGenerator(Check) 
{
    return(function(Req, Res, Next) {
        if(!Check(Req))
        {
            var Err = new Error();
            Err.Source = "ExpressUser";
            Err.Type = "InsecureConnection";
            Next(Err);
        }
        else
        {
            Next();
        }
    });
}

function ValidBody(Req, Properties)
{
    if(Req.body && (Req.body instanceof Object))
    {
        if(Properties.every(function(Item) {
            return(Req.body[Item] && (Req.body[Item] instanceof Object));
        }))
        {
            return true;
        }
    }
    return false;
}

ValidationRoutes['GetUserSession'] = function(UserSchema, NeedAuth) {
    var LoginFields = UserSchema.ListLogin();
    var AuthFields = UserSchema.ListAuth('User');
    return(function(Req, Res, Next) {
        var Err = new Error();
        Err.Source = "ExpressUserLocal";
        Err.Fields = [];
        var Locals = Res.locals;
        if(Req.session&&Req.session.User&&LoginFields.length>0)
        {
            Locals.ExpressUser = {'User': {}};
            Locals.ExpressUser['User'][LoginFields[0]] = Req.session.User[LoginFields[0]];
            var AuthPresent = false;
            var AuthOk = false;
            if(NeedAuth&&ValidBody(Req, ['User']))
            {
                AuthOk = AuthFields.every(function(Field, Index, List) {
                    if(typeof(Req.body.User[Field])!=='undefined')
                    {
                        AuthPresent = true;
                        Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                        if(UserSchema.Validate(Field, Req.body.User[Field]))
                        {
                            return true;
                        }
                        else
                        {
                            Err.Type = "BadField";
                            Err.Fields.push(Field);
                            return false;
                        }
                    }
                    else
                    {
                        return true;
                    }
                });
            }
            else if(NeedAuth)
            {
                Err.Type = "BadBody";
                Next(Err);
                return;
            }
            
            if((AuthPresent&&AuthOk) || (!NeedAuth))
            {
                Next();
                return;
            }
            else if((!AuthPresent) && NeedAuth)
            {
                Err.Type = "NoAuth";
            }
        }
        else
        {
            Err.Type = "NoSessionUser";
        }
        Next(Err);    
    });
};

ValidationRoutes['GetUserURL'] = function(UserSchema, PrivateOnly) {
    var IdFields = UserSchema.ListID();
    if(PrivateOnly)
    {
        IdFields = UserProperties.ListIntersection(IdFields, UserSchema.List('Privacy', UserProperties.Privacy.Private));
    }
    return(function(Req, Res, Next) {
        var Err = new Error();
        Err.Source = "ExpressUserLocal";
        Err.Fields = [];
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        var IdPresent = false;
        var IdOk = IdFields.every(function(Field, Index, List) {
            if(Req.params['Field']===Field)
            {
                IdPresent = true;
                Locals.ExpressUser['User'][Field]=Req.params['ID'];
                if(UserSchema.Validate(Field, Req.params['ID']))
                {
                    return true;
                }
                else
                {
                    Err.Type = "BadField";
                    Err.Fields.push(Field);
                    return false;
                }
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
        else if(!IdPresent)
        {
            Err.Type = "NoID";
        }
        Next(Err);
    });
};

ValidationRoutes['GetUserBody'] = function(UserSchema) {
    var LoginFields = UserSchema.ListLogin();
    var AuthFields = UserSchema.ListAuth('User');
    return(function(Req, Res, Next) {
        var Err = new Error();
        Err.Source = "ExpressUserLocal";
        Err.Fields = [];
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        var LoginPresent = false;
        var LoginOk = false;
        var AuthPresent = false;
        var AuthOk = false;
        if(ValidBody(Req, ['User']))
        {
            LoginOk = LoginFields.every(function(Field, Index, List) {
                if(typeof(Req.body.User[Field])!=='undefined')
                {
                    LoginPresent = true;
                    Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                    if(UserSchema.Validate(Field, Req.body.User[Field]))
                    {
                        return true;
                    }
                    else
                    {
                        Err.Type = "BadField";
                        Err.Fields.push(Field);
                        return false;
                    }
                }
                else
                {
                    return true;
                }
            });
            var AuthOk = AuthFields.every(function(Field, Index, List) {
                if(typeof(Req.body.User[Field])!=='undefined')
                {
                    AuthPresent = true;
                    Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                    if(UserSchema.Validate(Field, Req.body.User[Field]))
                    {
                        return true;
                    }
                    else
                    {
                        Err.Type = "BadField";
                        Err.Fields.push(Field);
                        return false;
                    }
                }
                else
                {
                    return true;
                }
            });
            
            if(LoginPresent&&LoginOk&&AuthPresent&&AuthOk)
            {
                Next();
                return;
            }
            else if(!LoginPresent)
            {
                Err.Type = "NoID";
            }
            else if(!AuthPresent)
            {
                Err.Type = "NoAuth";
            }
        }
        else
        {
            Err.Type = "BadBody";
        }
        
        Next(Err);
    });
}

ValidationRoutes['UsersPOST'] = function(UserSchema) {
    var AccessibleFields = UserSchema.List('Access', 'User');
    var ReqRegField = UserProperties.ListIntersection(UserSchema.List('Required', true), AccessibleFields);
    var OptRegField = UserProperties.ListIntersection(UserSchema.List('Required', false), AccessibleFields);
    var EmailAuthFields = UserSchema.ListAuth('Email');
    return(function(Req, Res, Next) {
        var Err = new Error();
        Err.Source = "ExpressUserLocal";
        Err.Fields = [];
        
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        var RequiredOk = false;
        var NotRequiredOk = false;
        if(ValidBody(Req, ['User']))
        {
            RequiredOk = ReqRegField.every(function(Field, Index, List) {
                Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                if(UserSchema.Validate(Field, Req.body.User[Field]))
                {
                    return true;
                }
                else
                {
                    Err.Type = "BadField";
                    Err.Fields.push(Field);
                    return false;
                }
            });
            NotRequiredOk = OptRegField.every(function(Field, Index, List) {
                if(typeof(Req.body.User[Field])!=='undefined')
                {
                    Locals.ExpressUser['User'][Field] = Req.body.User[Field];
                    if(UserSchema.Validate(Field, Req.body.User[Field]))
                    {
                        return true;
                    }
                    else
                    {
                        Err.Type = "BadField";
                        Err.Fields.push(Field);
                        return false;
                    }
                }
                else
                {
                    return true;
                }
            });
            
            if(RequiredOk&&NotRequiredOk)
            {
                if(EmailAuthFields.length>0)
                {
                    UserSchema.Generate(EmailAuthFields[0], function(Err, EmailToken) {
                        if(Err)
                        {
                            Next(Err);
                        }
                        else
                        {
                            Locals.ExpressUser['User'][EmailAuthFields[0]] = EmailToken;
                            Next();
                        }
                    });
                    return;
                }
                else
                {
                    Next();
                    return;
                }
                
            }
        }
        else
        {
            Err.Type = "BadBody";
        }
        
        Next(Err);
    });
};

ValidationRoutes['UserPATCH'] = function(UserSchema, EditPrivileges) {
    var EditableFields = UserSchema.ListEditable('User');
    var RestrictedFields = UserSchema.ListComplement(EditableFields);
    return(function(Req, Res, Next) {
        var Err = new Error();
        Err.Source = "ExpressUserLocal";
        Err.Fields = [];
        var Locals = Res.locals;
        Locals.ExpressUser['Update'] = {};
        
        var UpdateSomething = false;
        var EditableOk = true;
        var ConstantOk = true; 
        if(ValidBody(Req, ['Update']))
        {
            EditableOk = EditableFields.every(function(Field, Index, List) {
                if(typeof(Req.body.Update[Field])!=='undefined')
                {
                    UpdateSomething = true;
                    Locals.ExpressUser['Update'][Field] = Req.body.Update[Field];
                    if(UserSchema.Validate(Field, Req.body.Update[Field]))
                    {
                        return true;
                    }
                    else
                    {
                        Err.Type = "BadField";
                        Err.Fields.push(Field);
                        return false;
                    }
                }
                else
                {
                    return true;
                }
            });
            
            if(EditPrivileges)
            {
                ConstantOk = RestrictedFields.every(function(Field, Index, List) {
                    if(typeof(Req.body.Update[Field])!=='undefined')
                    {
                        UpdateSomething = true;
                        Locals.ExpressUser['Update'][Field] = Req.body.Update[Field];
                        if(UserSchema.Validate(Field, Req.body.Update[Field]))
                        {
                            return true;
                        }
                        else
                        {
                            Err.Type = "BadField";
                            Err.Fields.push(Field);
                            return false;
                        }
                    }
                    else
                    {
                        return true;
                    }
                });
            }
            
            if(UpdateSomething&&ConstantOk&&EditableOk)
            {
                Next();
                return;
            }
            else if(!UpdateSomething)
            {
                Err.Type = "NoField";
            }
        }
        else
        {
            Err.Type = "BadBody";
        }
        

        Next(Err);
    });
};

ValidationRoutes['UsersCountGET'] = function(UserSchema, Roles) {
    var PublicFields = UserSchema.List('Privacy', UserProperties.Privacy.Public);
    var GetUserURLRoute = ValidationRoutes['GetUserURL'](UserSchema);
    return(function(Req, Res, Next) {
        var IsPublic = PublicFields.some(function(Item, Index, List) {
            return Item===Req.params.Field;
        });
        if(IsPublic||AccessControl.Authenticate(Req, Res, Roles.Get))
        {
            GetUserURLRoute(Req, Res, Next);
            return;
        }
        var Err = new Error();
        Err.Source = "ExpressUserLocal";
        Err.Type = "PrivateField";
        Err.Fields = [Req.params.Field];
        Next(Err);
    });
};

ValidationRoutes['UserMembershipsVerifiedPUT'] = function(UserSchema) {
    var EmailAuthFields = UserSchema.ListAuth('Email');
    return(function(Req, Res, Next) {
        var Err = new Error();
        Err.Source = "ExpressUserLocal";
        if(ValidBody(Req, ['User']))
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
            else
            {
                Err.Type = "InvalidAuth";
            }
        }
        else
        {
            Err.Type = "BadBody";
        }
        
        Next(Err);
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
        var Locals = Res.locals;
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
                    Next(Err);
                }
                else
                {
                    Locals.ExpressUser['Update'][SetField] = GeneratedVal;
                    Next();
                }
            });
        }
        else
        {
            var Err = new Error();
            Err.Source = "ExpressUserLocal";
            Err.Type = "NoAuto";
            Next(Err);
        }
    });
};
    
module.exports = function(Options)
{
    var ConnectionSecurity = Options && Options.ConnectionSecurity ? Options.ConnectionSecurity : function(Req) {
        return((Req.ip=='127.0.0.1')||Req.secure);
    };
    var Roles = Options && Options.Roles ? Options.Roles : {'Edit': ['Admin'], 'Delete': ['Admin'], 'Get': ['Admin']};
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
    
    return function(Router) {
        if(ConnectionSecurity)
        {
            Router.use('/Users', ConnectionCheckGenerator(ConnectionSecurity));
            Router.use('/User', ConnectionCheckGenerator(ConnectionSecurity));
            Router.use('/Session/Self/User', ConnectionCheckGenerator(ConnectionSecurity));
        }
        
        if(BruteForceRoute)
        {
            Router.patch('/User/Self', BruteForceRoute);
            Router.delete('/User/Self', BruteForceRoute);
            Router.put('/Session/Self/User', BruteForceRoute);
            Router.put('/User/Self/Memberships/Validated', BruteForceRoute);
            Router.post('/User/:Field/:ID/Recovery/:SetField', BruteForceRoute);
        }
        
        if(CsrfRoute)
        {
            Router.patch('/User/:Field/:ID', CsrfRoute);
            Router.delete('/User/:Field/:ID', CsrfRoute);
            Router.put('/Session/Self/User', CsrfRoute);
            Router.delete('/Session/Self/User', CsrfRoute);
            Router.put('/User/Self/Memberships/Validated', CsrfRoute);
            Router.post('/User/:Field/:ID/Recovery/:SetField', CsrfRoute);
        }
        
        if(CsrfRoute&&(!MinimalCsrf))
        {
            Router.post('/Users', CsrfRoute);
            Router.patch('/User/Self', CsrfRoute);
            Router.delete('/User/Self', CsrfRoute);
        }
        
        if(Roles&&Roles.Edit)
        {
            Router.patch('/User/:Field/:ID', AccessControl.AuthenticateRoute(Roles['Edit']));
            Router.patch('/User/:Field/:ID', ValidationRoutes.GetUserURL(UserSchema));
            Router.patch('/User/:Field/:ID', ValidationRoutes.UserPATCH(UserSchema, true));
            //Router.put('/User/:Field/:ID/Memberships/:Membership', AccessControl.AuthenticateRoute(Roles['Edit']));
        }
        
        if(Roles&&Roles.Delete)
        {
            Router.delete('/User/:Field/:ID', AccessControl.AuthenticateRoute(Roles['Delete']));
            Router.delete('/User/:Field/:ID', ValidationRoutes.GetUserURL(UserSchema));
            //Router.delete('/User/:Field/:ID/Memberships/:Membership', AccessControl.AuthenticateRoute(Roles['Delete']));
        }
        
        if(Roles&&Roles.Get)
        {
            Router.get('/User/:Field/:ID', AccessControl.AuthenticateRoute(Roles['Get']));
            Router.get('/User/:Field/:ID', ValidationRoutes.GetUserURL(UserSchema));
            Router.get('/User/:Field/:ID', ValidationRoutes.UserGET(UserSchema, HideSecret));
        }
        
        Router.use('/User/Self', AccessControl.AuthenticateRoute());
        
        Router.post('/Users', ValidationRoutes.UsersPOST(UserSchema));
        Router.get('/Users/:Field/:ID/Count', ValidationRoutes.UsersCountGET(UserSchema, Roles));
        
        Router.patch('/User/Self', ValidationRoutes.GetUserSession(UserSchema, true));
        Router.patch('/User/Self', ValidationRoutes.UserPATCH(UserSchema, false));
        
        Router.delete('/User/Self', ValidationRoutes.GetUserSession(UserSchema, true));
        
        Router.get('/User/Self', ValidationRoutes.GetUserSession(UserSchema, false));
        Router.get('/User/Self', ValidationRoutes.UserGET(UserSchema, HideSecret));
        
        Router.post('/User/:Field/:ID/Recovery/:SetField', ValidationRoutes.GetUserURL(UserSchema, true));
        Router.post('/User/:Field/:ID/Recovery/:SetField', ValidationRoutes.UserPOST(UserSchema));
        
        Router.put('/Session/Self/User', ValidationRoutes.GetUserBody(UserSchema));
        
        Router.put('/User/Self/Memberships/Validated', ValidationRoutes.GetUserSession(UserSchema, false));
        Router.put('/User/Self/Memberships/Validated', ValidationRoutes.UserMembershipsVerifiedPUT(UserSchema));
    };
}
