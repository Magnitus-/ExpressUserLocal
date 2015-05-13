Express-User-Local
==================

Module to validate incoming requests using a local strategy (username, email, password) for the express-user library.

The structure is pretty stable at this point, but I'll keep the alpha label until unit tests and doc are finalized.

Known Bug(s)
============

...

Doc Notice
==========

Some of the present doc is dated.

Doc overhaul will proceed once tests are complete (soon).

Usage
=====

```javascript
//See the example in the express-user project for the entire code

//Some code

var ExpressUser = require('express-user');
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

- BruteForceRoute: Route used to handle brute-force attacks on password or email token dependant requests ("PUT /Session/Self/User", "PATCH /User/Self", "DELETE /User/Self" and "PUT /User/Self/Memberships/Validated"). See the example in the express-user project for an implementation using express-brute.

- HideSecret: Specifies that secret fields shouldn't be returned for GET requests. Defaults to True. Very important to prevent users from seeing their email verification token from their account.

- UserSchema: Schema object that specifies a user's fields and their properties. It defaults to this (see user-properties project for details):

```javascript
{
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
    }
}
```

- CsrfRoute: Route that enforces Csrf token verification (see the example in express-user for an implementation making use of the csurf project). It can be set to null (if you want to fine tune csrf protection yourself for example).

- MinimalCsrf: Boolean value that defaults to true.

With this default, the admin "PATCH /User/:Field/:ID" and "DELETE /User/:Field/:ID" requests check for the Csrf token as well as the "PUT /Session/Self/User", "DELETE /Session/Self/User" and "PUT /User/Self/Memberships/Validated" requests.

The both requests are protected because they are the main attack surface for csrf attacks.

login/logout have been added to the default protection to foil potential attack vectors if an attacker managed to login someone under his account and to prevent potential loss of trust from users if an attacker manages to log them out from an external web page.

If MinimalCsrf is set to false, the following requests also check for the csrf token:

-PUT /Users

Probably pointless to protect. A user motivated to abuse the account creation may as well create a standalone script that fetches the login form and accompanying csrf token, parse the form to retrieve the token and perform the request.

-PATCH /User/Self and DELETE /User/Self

These already require the user to input his password (to modify or delete his account respectively) making the csrf token check redundant. Besides, as with the login, if a third party website convinces your user to input his password for your web site on theirs, his account is already compromised.

Example
=======

Notice: Changes have been made that may break the example until I incorporate those changes in the express-user-local-basic project.

While keeping in mind that details will probably change in the future, you can play with what is currently there, by running the Example.js server (you'll need the dev dependencies to run it) and going to the following adress in your browser: http://127.0.0.1:8080/

In order to avoid an email server dependency just to run the example (days of fun for the uninitiated), the example uses a mock call that justs prints the email address and token of a newly registered user on the console rather than try to send an actual email.

Future Development
==================

Here are some potential improvements I'd find desirable for the project. Note however that at this point, the project as it is meets my personal needs so consider those changes long terms goals for the project.

- Access hiaerchy: 

Atm, access privileges are rather flat as anybody who has view/edit/delete privileges can view/edit/delete anyone else.

Ideally, you'd pass an hierachy array of groups and groups couldn't modify those higher in the array.

This would require an additional RestrictedGroups argument to be passed to express-user during a request which would be passed to user-store which would tailor its query to exclude documents/rows where Memberships contains one of those restricted groups.

- Custom Verification

At this point, Email verification, while optional, is hard coded into the project.

Eventually, it would be desirable to add a customiseable hook architecture for verification instead with the Email Verification hook being included with the project.

- More Fine Grained Brute Force Routing

Currently, only one brute force handler is applied to all routes that have brute force protection.

Eventually, I'd like to provide constructor options to give more fine-grained control concerning applying various brute force handlers to various routes.

- Custom Route Disabling (or greater privilege requirements)

Eventually, I'd like to provide more fine-grained constructor options so that you can optionally disable certain routes or assign to them greater privilege requirements.

History
=======

0.0.1-alpha.20
--------------

- More tests
- Added PUT /User/:Field/:ID/Memberships/:Membership and DELETE /User/:Field/:ID/Memberships/:Membership to the list of routes the optional Csrf handler is applied to.
- Changed functionality such that when the email field is updated, a new email token is generated and user validation is reset.

0.0.1-alpha.19
--------------

- More tests
- Bit of refactoring
- Updated user-properties dependency to version 3.4.0
- Changed handling of URL parameters to parse fields as dictated by the user schema.
- Added missing validation for the email authentication field in the PUT /User/Self/Memberships/Validated route.
- Indicated the nuances for different errors in the PUT /User/Self/Memberships/Validated and made the errors most consistent with the rest of the library.
- Implemented handlers for the PUT /User/:Field/:ID/Memberships/:Membership and the DELETE /User/:Field/:ID/Memberships/:Membership routes.
- Fixed bug where certain options that can be defined with a falsey values would be ignored when they do.
- Updated dev dependencies of user-store and express-user to versions 2.1.0 and 1.1.1.
- Removed regex-email from dev dependencies as its already in the dependencies

0.0.1-alpha.18
--------------

- More tests
- Improved GET /User/:Field/:ID/Count feedback to distinguish access attempts to a inexistent field from forbibben access attempts to a private field.
- Fixed minor bug in GET /User/:Field/:Value/Count, where only ID fields could be accepted.

0.0.1-alpha.17
--------------

- More tests
- Changed container of invalid update fields for PATCH methods from Err.Fields to Err.UpdateFields to more easily differentiate them from invalid authentication fields.
- Added checks against null for required fields in PATCH routes rather than just delegate it to schema validation or user-store constraint
- Fixed minor bug where only first bad field for updates would be reported for PATCH routes
- Removed the restricted fields hidding for the GET /User/:Field/:ID route

0.0.1-alpha.16
--------------

- More tests
- Changed the name of 'HideSecret' option to 'HideRestricted'.
- Changed GET /User/Self and GET /User/:Field/:ID routes to also hide fields whose access is not specified as 'User' if the HideRestricted option is set to true.

0.0.1-alpha.15
--------------

- Added POST /Users (ie, registration) to the list of routes on which brute force checks are applied
- Added checks against undefined and null for required fields in POST /Users rather than just delegate it to schema validation or user-store constraint
- Fixed minor bug where only first bad field would be reported for POST /Users
- Changed the expected format of the UserSchema option to an user-properties instance
- Changed the version of user-properties and express-access-control dependencies to a range of supported versions
- Changed PUT /Session/Self/User route to only accept fields that are user or email accessible for login
- Changed PUT /Session/Self/User route to check against null for login or auth, rather than defer that check to schema validator.
- Started tests
- Updated user-store dev dependency to version 2.0.3 and adapted the example accordingly

0.0.1-alpha.14
--------------

- Updated dev dependency for express-user to version 1.0.1
- Added handler to DELETE /Session/Self/User to defined res.locals.ExpressUser


0.0.1-alpha.13
--------------

- Updated express-access-control dependency to version 2.0.0.
- Updated express-user and express-user-local-bacic dev dependencies to version 1.0.0 and 0.0.1-alpha.3 respectively.
- Added Roles option in the constructor.
- Moved connection security route from express-user to this project.
- Moved admin access verification routes from express-user to this project.
- Updated dev dependency of user-store to version 1.3.0.

0.0.1-alpha.12
--------------

- Updated dev dependendices for express-user and express-user-local-basic to versions 0.0.1-alpha.15 and 0.0.1-alpha.2 respectivelly
- Updated library to be compatiable with route change in the 0.0.1-alpha.15 version of express-user
- Replaced response logic by feedback to pass to Responder
- Improved bad input handling for body structure of requests
- Fixed bug that occurs when a email token generator that can fail fails.

0.0.1-alpha.11
--------------

- Fix bug that prevented /User/:Field/:ID/:SetField route from working
- Implemented Password/Email Token recovery in the example.

0.0.1-alpha.10
--------------
- Updated user-properties dependency to version 3.1.0.
- Updated dev dependency of express-user to version 0.0.1-alpha.14
- Updated default schema to take into account the new features of user-properties
- Removed the EmailTokenGen constructor property, which is made redundant by new capacities in the schema
- Added facilities to re-generate the Password and EmailToken.
- Moved the SendMail option to Responder.
- Added the express-user-local-basic project to dev dependencies.
- Adapted example to changes.

0.0.1-alpha.9
-------------

- Added uid-safe dependency
- Updated user-properties dependency to version 2.0.0
- Updated dev dependency of express-user to version 0.0.1-alpha.13
- Modified default user schema to include a EmailToken field.
- Added support to '/User/Self/Memberships/Validated' route to submit email token.
- Modified the example to work with email tokens.
- Added 2 new options to constructor to accomodate email validation customization.
- Added new option to constructor to hide hidden fields from GET requests (HideSecrets) and added handler to specify to express-user which fields should be hidden.

0.0.1-alpha.8
-------------

- Added Login/Logout to default Csrf protection.
- Moved express-user/express-user-local example to this project
- Added a bit of documentation
- Removed express as a direct dependency

0.0.1-alpha.7
-------------

Added csrf support

0.0.1.alpha.6
-------------

Added doc for the latest feature of 0.0.1.alpha.5

0.0.1.alpha.5
-------------

- Added user-properties dependency
- Added customization for users' fields
- Made the expected format for body parameters (more specifically in regard to identification/authentification vs updating) more uniform across request types.

0.0.1.alpha.4
-------------

- Increased documentation details
- Added option to pass a route to handle brute force.

0.0.1-alpha.3
-------------

- Added support for /Users/:Field/:ID/Count/.

0.0.1-alpha.2
-------------

- Adjusted to the change of API in express-user version 0.0.1-alpha.5
- Added express-access-control as a dependency
- Cleaned up the dev dependencies (not needed until there are tests)

0.0.1-alpha.1
-------------

Changed session management URL from /Session/User to /Session/Self/User

0.0.0 
-----

Initial prototype





















