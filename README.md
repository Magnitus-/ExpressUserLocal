Express-User-Local
==================

Module to validate incoming requests using a local strategy (username, email, password) and a persistent session for the express-user library.

This is a validator in the validator/store/responder architecture described in the express-user project.

Requirements
============

Beyond the requirements from the package.json file and those described in the express-user dependency, this project requires:

- A session library: Either express-session or one that behaves just like it.
- A brute-force routing library like express-brute (if you want to pass a brute force handler to the constructor)
- A csrf routing library like csurf (if you want to pass a csrf handler to the constructor)

Usage
=====

Overview
--------

This library is callable as a function and which returns a validator which can be passed directly to the express-user library.

The code would look like this:

```javascript

//Some other requires
var ExpressUser = require('express-user');
var ExpressUserLocal = require('express-user-local');

//Define options to pass to express-user-local
//Define the responder as well, more details about that part in final version of express-user-local-basic project

var Validator = ExpressUserLocal(UserLocalOptions);                                           //More details on available options below
var UserRouter = ExpressUser(UserStore, {'Validator': Validator, 'Responder': Responder});    //Generate our main router to pass to Express
App.use(ExpressUser.SessionRoute(UserStore, '_id'));                                          //Sync Req.session.User with the user's profile in the database. _id is used as a immutable field that won't change for any user.
App.use(UserRouter);                                                                          //Pass our router to express
```

Options
-------

express-user-local takes an options object as its sole argument. The belows are the options you can set on the object and their expected format.

- ConnectionSecurity: A function that takes the signature function(req) and returns true if the connection is secure, else false

- Roles: Defines what groups have super-user privileges to view, edit and delete profiles.

It is an object containing 3 keys: 'Edit', 'Delete' and 'Get'. Each key contains an array of groups (strings) that possess the accompanying privilege (granted by special admin routes described in the architecture).

Setting either the Roles object or some of its keys to null will disable corresponding admin routes.

- EmailRegex: Regular expression that ensures email addresses provided email addresses are well formed if the default user schema is used.

- UsernameRegex: Regular expression that ensures email addresses provided usernames are well formed if the default user schema is used.

- PasswordRegex: Regular expression that ensures email addresses provided passwords are well formed if the default user schema is used.

- BruteForceRoute: An handler to check against brute force attacks which will be applied to the following routes...

```
PATCH /User/Self
DELETE /User/Self
PUT /Session/Self/User
PUT /User/Self/Memberships/Validated
POST /User/:Field/:ID/Recovery/:SetField
POST /Users
```

The philosophy behing which routes are protected is the following: Prevent an attacker from guessing private/secret fields through trial-and-error 

- CsrfRoute: An handler to check for a valid csrf token which will be applied to the following routes...

```
PATCH /User/:Field/:ID
DELETE /User/:Field/:ID
PUT /User/:Field/:ID/Memberships/:Membership
DELETE /User/:Field/:ID/Memberships/:Membership
PUT /Session/Self/User
PUT /User/Self/Memberships/Validated (if email verification is enabled)
POST /User/:Field/:ID/Recovery/:SetField
```

In short, routes that don't require authentication in the request and perform exploitable actions are protected.

- MinimalCsrf: If set to false, the csrf handler is applied to the following routes as well:

```
POST /Users
PATCH /User/Self
DELETE /User/Self
PUT /User/Self/Memberships/Validated
```

- HideRestricted: If set to true, the library tells the responder to hide sensitive ('Privacy' is secret) or non-accessible ('Access' property is not 'User') fields for the GET /User/Self route.

- EmailField: Tells the libray which field in UserSchema corresponds to the user's email. If email verification is enabled, the library will use this value to determine if the user's email is being changed in the PATCH routes.

- UserSchema: Instance of the user-properties project which tells the library what fields it can expect a user to have and their properties. This argument has a profound impact on the library's behavior and setting the right properties for various user fields is crucial for security purposes.

In terms of expectations, your UserSchema should at least contains a field suitable for login identification and a field that is suitable for authentification.

A field suitable for login identification is one that is listed in the following (required, unique, not public and accessible either by user or his email): ```UserProperties.ListUnion(UserSchema.ListLogin('User'), UserSchema.ListLogin('Email'))```

A field suitable for authentication is one that is listed in the following (secret, required, accessible by user): ```UserSchema.ListAuth('User')```

Defaults
--------

Options have the given default values when they are not defined in the object passed to express-user-local:

- ConnectionSecurity: A function that returns true if the requester's IP is 127.0.0.1 or if req.secure is true
- Roles: ```{'Edit': ['Admin'], 'Delete': ['Admin'], 'Get': ['Admin']}```
- EmailRegex: Regular expression provided by the regex-email project
- UsernameRegex: ```new RegExp("^[a-zA-Z][\\w\\+\\-\\.]{0,19}$");```
- PasswordRegex: ```new RegExp("^.{8,20}$");```
- BruteForceRoute: null (not brute force handler is applied)
- CsrfRoute: null (not csrf handler is applied)
- MinimalCsrf: true
- HideRestricted: true
- EmailField: 'Email'
- UserSchema: 

```javascript
var UserProperties = require('user-properties');
var Uid = require('uid-safe').sync;

//...

var Verifications ={'Username': Options.EmailRegex, 'Email': Options.EmailRegex, 'Password': Options.PasswordRegex};

//...

//If Options.UserSchema is not defined, it is assigned this:
UserProperties({
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
        'Description': function(Value) {return (typeof(Value)!='undefined')&&Verifications['Email'].test(Value)&&Value.length&&(Value.legth<=80)}
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
    }});
```

Email Verification
==================

Email verification is handled through secret email token generation in this library.

It will only be enabled is you have a field in your UserSchema that fulfills the following criteria:

```javascript
//This call returns suitable fields
function GetEmailToken(UserSchema)
{
    return UserProperties.ListIntersection(UserProperties.ListIntersection(UserSchema.ListEditable('Email'), UserSchema.ListAuth('Email')), UserSchema.ListGeneratable());
}
```

Basically, the field must be secret, generatable automatically, accessible via email, required and mutable.

If a field that fulfills these criteria is present in your schema, the following will occur:

The 'PUT /User/Self/Memberships/Validated' route will be defined, allowing users to add 'Validated' to their memberships if they submit their email token in the request

The 'POST /Users' route will automatically generate an email token for the user, using the generator you defined in your schema.

Both 'PATCH' routes will generate a new email token for the user and remove his 'Validated' membership if 'EmailField' (the field you defined in the constructor's options as being the user's email) is changed.

Access Restriction
==================

All the '/User/Self' routes require the user to be logged in.

The following routes require a logged in user with 'Edit' privileges:

PATCH /User/:Field/:ID
PUT /User/:Field/:ID/Memberships/:Membership

The following routes require a logged in user with 'Delete' privileges:

DELETE /User/:Field/:ID
DELETE /User/:Field/:ID/Memberships/:Membership

The following routes require a logged in user with 'Get' privileges:

GET /User/:Field/:ID

Additionally, 'Field' in the following route can only be a public field unless the user is logged in with 'Get' privileges:

GET /Users/:Field/:ID/Count

Disabled URLs
=============

The following urls are not handled by express-user-local:

- PUT /User/Self/Memberships/:Membership
- DELETE /User/Self/Memberships/:Membership
- POST /User/Self/Recovery/:SetField

However, the following instance of 'PUT /User/Self/Memberships/:Membership' is enabled if email verification is used:

PUT /User/Self/Memberships/Validated

Expected Input From Request
===========================

Request Body
------------

express-user-local expect the request's body to be an object contained in req.body. As such, you'll need a body parser (like the body-parser project) to parse the bodies of requests and store them in req.body.

The library reads 2 properties in the body object: User and Update (sometimes one, sometimes both, sometimes neither). Both req.body.User and req.body.Update, when present, are expected to be objects.

The req.body.User object defines user field values that either identifies an existing user or creates a new one.

The req.body.Update object defines user field values that an existing user will be updated with.

Overall Field Correctness
-------------------------

express-user-local recognizes only on fields defined in the UserSchema passed to the constructor. Any additional fields will be ignored (ie, will be as if those fields weren't present).

All field values (including those passed in the url) are validated using the 'Validate' method of the UserSchema. Additionally, checks are made against null or undefined for mandatory fields.

And finally, field values that are passed in the url will be parsed using the 'Parse' method of the UserSchema before being validated. The default 'Parse' method of user-properties will return the value as-is so it's only necessary to define it for non-string values.

POST /Users
-----------

...

PATCH /User/Self
----------------

...

DELETE /User/Self
-----------------

...

GET /User/Self
--------------

...

PUT /Session/Self/User
----------------------

...

DELETE /Session/Self/User
-------------------------

...

GET /Users/:Field/:ID/Count
---------------------------

...

PUT /User/Self/Memberships/Validated
------------------------------------

...

POST /User/:Field/:ID/Recovery/:SetField
----------------------------------------

...

PATCH /User/:Field/:ID
----------------------

...

DELETE /User/:Field/:ID
-----------------------

...

GET /User/:Field/:ID
--------------------

...

PUT /User/:Field/:ID/Memberships/:Membership
--------------------------------------------

...

DELETE /User/:Field/:ID/Memberships/:Membership
-----------------------------------------------

...

Output to Other Components
==========================

POST /Users
-----------

...

PATCH /User/Self
----------------

...

DELETE /User/Self
-----------------

...

GET /User/Self
--------------

...

PUT /Session/Self/User
----------------------

...

DELETE /Session/Self/User
-------------------------

...

GET /Users/:Field/:ID/Count
---------------------------

...

PUT /User/Self/Memberships/Validated
------------------------------------

...

POST /User/:Field/:ID/Recovery/:SetField
----------------------------------------

...

PATCH /User/:Field/:ID
----------------------

...

DELETE /User/:Field/:ID
-----------------------

...

GET /User/:Field/:ID
--------------------

...

PUT /User/:Field/:ID/Memberships/:Membership
--------------------------------------------

...

DELETE /User/:Field/:ID/Memberships/:Membership
-----------------------------------------------

...

Example
=======

Notice: Changes have been made that may break the example until I incorporate those changes in the express-user-local-basic project.

While keeping in mind that details will probably change in the future, you can play with what is currently there, by running the Example.js server (you'll need the dev dependencies to run it) and going to the following adress in your browser: http://127.0.0.1:8080/

In order to avoid an email server dependency just to run the example (days of fun for the uninitiated), the example uses a mock call that justs prints the email address and token of a newly registered user on the console rather than try to send an actual email.

Future Development
==================

- Finish tests for :Field/:ID parametric URLs where ID is non-string

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

1.0.0
-----

- More tests
- Changed functionality such that when there is not email authentication, PUT /User/Self/Memberships/Validated flags a lack of validation error, not a lack of access error
- Changed default email verification to allow at most 80 characters long email addresses
- Made the PUT /User/Self/Memberships/Validated route use csrf only if MinimalCsrf is set to true
- Started Documentation

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





















