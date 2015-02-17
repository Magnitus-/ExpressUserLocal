Express-User-Local
==================

Module to validate incoming requests using a local strategy (username, email, password) for the express-user library.

Like express-user, this library is currently prototypical and subject to future change.

Future tests and doc to come once the library is finalized.

Usage
=====

```javascript
//See the example in the express-user project for the entire code

//Some code

var ExpressUser = require('express-user);
var ExpressUserLocal = require('express-user-local');

var UserLocal = ExpressUserLocal(UserLocalOptions);                   //More details on available options below
var UserRouter = ExpressUser(UserStore, {'Validator': UserLocal});    //Generate our main router to pass to Express, using our UserLocal validator
App.use(ExpressUser.SessionRoute(UserStore, '_id'));                  //Sync Req.session.User with the user's profile in the database. _id is used as a immutable field that won't change for any user.
App.use(UserRouter);                                                  //Pass our router to express
```

Options
-------

- EmailRegex: Regular expression used to validate emails. Defaults to the regex-email project.

- UsernameRegex: Regular expression used to validate user names. Defaults to something that must start with a letter, is 20 characters long at most and must contain alphanumerical characters and/or the '+', '-' or '.' characters. 

- PasswordRegex: Regular expression used to validate passwords. Defaults to any characters, between 8 and 20 characters long.

- BruteForceRoute: Route used to handle brute-force attacks on password dependant requests ("PUT /Session/Self/User", "PATCH /User/Self" and "DELETE /User/Self"). See the example in the express-user project for an implementation using express-brute.

- UserSchema: Schema object that specifies a user's fields and their properties. It defaults to this (see user-properties project for details):

```javascript
{
    'Username': {
        'Required': true,
        'Unique': true,
        'Mutable': false,
        'Description': function(Value) {return (typeof(Value)!='undefined')&&UsernameRegex.test(Value)}
    },
    'Email': {
        'Required': true,
        'Unique': true,
        'Private': true,
        'Description': function(Value) {return (typeof(Value)!='undefined')&&EmailRegex.test(Value)}
    },
    'Password': {
        'Required': true,
        'Private': true,
        'Secret': true,
        'Retrievable': false,
        'Description': function(Value) {return (typeof(Value)!='undefined')&&PasswordRegex.test(Value)}
    }
}
```

- CsrfRoute: Route that enforces Csrf token verification (see the example in express-user for an implementation making use of the csurf project)

- MinimalCsrf: Boolean value that defaults to true.

With this default, only the admin "PATCH /User/:Field/:ID" and "DELETE /User/:Field/:ID" requests check for the Csrf token as they are the main request of interests where csrf protection would actually mitigate an attack.

However, if MinimalCsrf is set to false, the following requests also check for the csrf token:

-PUT /Users

Probably pointless to protect. A user motivated to abuse the account creation may as well create a standalone script that fetches the login form and accompanying csrf token, parse the form to retrieve the token and perform the request.

-PUT /Session/Self/User

This is the login. If another website convince a user to input his credentials for your web site on theirs, his account is already compromised anyways.

-DELETE /Session/Self/User

Yes, technically, some third party web site could repeatedly perform ajax requests to force your users to logout while they run the offending web page in their browser (perhaps in a tab in the background).

However, someone that motivated to negatively impact the experience of your users may as well forgo doing something that would only impact a tiny fraction of your users (and would probably more easily be traceable to him) and opt for a full blow DoS attack instead.

-PATCH /User/Self and DELETE /User/Self

These already require the user to input his password (to modify or delete his account respectively) making the csrf token check redundant. Besides, as with the login, if a third party website convinces your user to input his password for your web site on theirs, his account is already compromised.

History
=======

0.0.0 
-----

Initial prototype

0.0.1-alpha.1
-------------

Changed session management URL from /Session/User to /Session/Self/User

0.0.1-alpha.2
-------------

- Adjusted to the change of API in express-user version 0.0.1-alpha.5
- Added express-access-control as a dependency
- Cleaned up the dev dependencies (not needed until there are tests)

0.0.1-alpha.3
-------------

- Added support for /Users/:Field/:ID/Count/.

0.0.1.alpha.4
-------------

- Increased documentation details
- Added option to pass a route to handle brute force.

0.0.1.alpha.5
-------------

- Added user-properties dependency
- Added customization for users' fields
- Made the expected format for body parameters (more specifically in regard to identification/authentification vs updating) more uniform across request types.

0.0.1.alpha.6
-------------

Added doc for the latest feature of 0.0.1.alpha.5

0.0.1-alpha.7
-------------

- Added csrf support
