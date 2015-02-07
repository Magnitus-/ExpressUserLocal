//Copyright (c) 2015 Eric Vallee <eric_vallee2003@yahoo.ca>
//MIT License: https://raw.githubusercontent.com/Magnitus-/ExpressUserLocal/master/License.txt

var AccessControl = require('express-access-control');
var EmailRegex = require('regex-email');
var UsernameRegex = new RegExp("^[a-zA-Z][\\w\\+\\-\\.]{0,19}$");
var PasswordRegex = new RegExp("^.{8,20}$");

var ValidationRoutes = {};

//return route handler instead!
ValidationRoutes['GetUserSession'] = function(Verifications, NeedPassword) {
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        if(Req.session&&Req.session.User)
        {
            var ValidPassword = typeof(Req.body.Password)=='string' && Verifications.Password.test(Req.body.Password);
            if(ValidPassword || (!NeedPassword))
            {
                Locals.ExpressUser = {'User': {'Username': Req.session.User.Username, 'Email': Req.session.User.Email}};
                if(NeedPassword)
                {
                    Locals.ExpressUser['Password'] = Req.body.Password;
                }
                Next();
                return;
            }
        }
        Res.status(400).end();     
    });
};

ValidationRoutes['GetUserURL'] = function(Verifications) {
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        if((Req.params.Field=='Email')&&(typeof(Req.params.ID)=='string')&&(Verifications.Email.test(Req.params.ID)))
        {
            Locals.ExpressUser['User']['Email'] = Req.params.ID;
        }
        else if((Req.params.Field=='Username')&&(typeof(Req.params.ID)=='string')&&(Verifications.Username.test(Req.params.ID)))
        {
            Locals.ExpressUser['User']['Username'] = Req.params.ID;
        }
        else
        {
            Res.status(400).end(); 
            return;
        }
        Next();   
    });
};

ValidationRoutes['GetUserBody'] = function(Verifications) {
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        Locals.ExpressUser = {'User': {}};
        if(typeof(Req.body.Email)=='string'&&(Verifications.Email.test(Req.body.Email)))
        {
            Locals.ExpressUser['User']['Email'] = Req.body.Email;
            if(Req.body.Password&&(Verifications.Password.test(Req.body.Password)))
            {
                Locals.ExpressUser['User']['Password'] = Req.body.Password;
                Next();
                return;
            }
        }
        Res.status(400).end(); 
    });
}

ValidationRoutes['UsersPOST'] = function(Verifications) {
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        if(typeof(Req.body.Email)=='string'&&typeof(Req.body.Username)=='string'&&typeof(Req.body.Password)=='string')
        {
            if(Verifications['Email'].test(Req.body.Email )&& (Req.body.Email.length<=60) && Verifications['Username'].test(Req.body.Username) && Verifications['Password'].test(Req.body.Password))
            {
                Locals.ExpressUser = {'User': {'Username': Req.body.Username, 'Email': Req.body.Email, 'Password': Req.body.Password}};
                Next();
                return;
            }
        }
        Res.status(400).end();
    });
};

ValidationRoutes['UserPATCH'] = function(Verifications) {
    return(function(Req, Res, Next) {
        var Locals = Res.locals;
        var UpdateSomething = false;
        Locals.ExpressUser['Update'] = {};

        if(typeof(Req.body.NewPassword)=='string')
        {
            if(Verifications.Password.test(Req.body.NewPassword))
            {
                Locals.ExpressUser['Update']['Password'] = Req.body.NewPassword;
                UpdateSomething = true;
            }
            else
            {
                Res.status(400).end();
                return;
            }
        }
        
        if(typeof(Req.body.Username)=='string')
        {
            if(Verifications.Username.test(Req.body.Username))
            {
                Locals.ExpressUser['Update']['Username'] = Req.body.Username;
                UpdateSomething = true;
            }
            else
            {
                Res.status(400).end();
                return;
            }
        }
        
        if(typeof(Req.body.Email)=='string')
        {
            if(Verifications.Email.test(Req.body.Email))
            {
                Locals.ExpressUser['Update']['Email'] = Req.body.Email;
                UpdateSomething = true;
            }
            else
            {
                Res.status(400).end();
                return;
            }
        }
        
        if(UpdateSomething)
        {
            Next();
            return;
        }
        else
        {
            Res.status(400).end();
            return;
        }
    });
};

ValidationRoutes['UsersCountGET'] = function(Verifications, Roles) {
    var GetUserURLRoute = ValidationRoutes['GetUserURL'](Verifications);
    return(function(Req, Res, Next) {
        if((Req.params.Field=='Username')||AccessControl.Authenticate(Req, Res, Roles.Get))
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
    
    return function(Router, Roles) {
        if(BruteForceRoute)
        {
            Router.patch('/User/Self', BruteForceRoute);
            Router.delete('/User/Self', BruteForceRoute);
            Router.put('/Session/Self/User', BruteForceRoute);
        }
        
        Router.post('/Users', ValidationRoutes.UsersPOST(Verifications));
        Router.get('/Users/:Field/:ID/Count', ValidationRoutes.UsersCountGET(Verifications, Roles));
        
        Router.patch('/User/Self', ValidationRoutes.GetUserSession(Verifications, true));
        Router.patch('/User/Self', ValidationRoutes.UserPATCH(Verifications));
        Router.patch('/User/:Field/:ID', ValidationRoutes.GetUserURL(Verifications));
        Router.patch('/User/:Field/:ID', ValidationRoutes.UserPATCH(Verifications));
        
        Router.delete('/User/Self', ValidationRoutes.GetUserSession(Verifications, true));
        Router.delete('/User/:Field/:ID', ValidationRoutes.GetUserURL(Verifications));
        
        Router.get('/User/Self', ValidationRoutes.GetUserSession(Verifications, false));
        Router.get('/User/:Field/:ID', ValidationRoutes.GetUserURL(Verifications));
        
        Router.put('/Session/Self/User', ValidationRoutes.GetUserBody(Verifications));
    };
}
