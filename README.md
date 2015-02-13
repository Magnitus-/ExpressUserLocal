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
