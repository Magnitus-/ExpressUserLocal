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

var Verifications ={'Username': Options.UsernameRegex, 'Email': Options.EmailRegex, 'Password': Options.PasswordRegex};

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

Session Requirement for Self and Admin Routes
---------------------------------------------

All routes that require a user to be logged in require a Req.session.User object containing the info of the logged in user to be defined.

The express-user project provides a special route to define this object and keep it in sync with the user's profile in the database.

POST /Users
-----------

- Req.body.User: 

The values for the new user's fields. Fields that are not marked as accessible to users (ie, 'Access' property is 'User') will be ignored.

Fields that are required ('Required' property is true) need to be present. 

Fields that are not required, may or may not be present.

PATCH /User/Self
----------------

- Req.session.User: Nees to be properly defined.

- Req.body.User:

Needs to contain a field that authentifies the user ('Acccess' is 'User', 'Privacy' is secret, 'Required' is true) against the user his session points to.

Other fields will be ignored.

- Req.body.Update: 

The values for the fields that are to be updated. Fields that are not user accessible ('Access' is not 'User') or not mutable will be ignored.

DELETE /User/Self
-----------------

- Req.session.User: Nees to be properly defined.

- Req.body.User:

Needs to contain a field that authentifies the user ('Acccess' is 'User', 'Privacy' is secret, 'Required' is true) against the user his session points to.

Other fields will be ignored.

GET /User/Self
--------------

- Req.session.User: Nees to be properly defined.

PUT /Session/Self/User
----------------------

- Req.body.User:

Needs to contain a field that authentifies the user ('Acccess' is 'User', 'Privacy' is secret, 'Required' is true) against the user his session points to.

Also needs to contain a non public field that identifies the user (required and unique and access is either 'User' or 'Email').

Other fields will be ignored.

DELETE /Session/Self/User
-------------------------

- Req.session.User: Nees to be properly defined.

GET /Users/:Field/:ID/Count
---------------------------

- Req.session.User: Nees to be properly defined to make use of superuser Get access.

- URL Parameters: For regular access, the 'Field' parameter needs to be public. For superuser Get access, 'Field' can be any field in the UserSchema.

Other fields will be ignored.

PUT /User/Self/Memberships/Validated
------------------------------------

- Req.session.User: Nees to be properly defined.

- Req.body.User:

Needs to contain a field that authentifies the user's access to his email (required, secret and 'Access' is 'Email').

Other fields will be ignored.

POST /User/:Field/:ID/Recovery/:SetField
----------------------------------------

- Req.session.User: Nees to be properly defined.

- URL Parameters:

'Field' needs to be a non public field that identifies the user (required and unique and access is either 'User' or 'Email'). All other fields will be ignored.

'SetField' needs to be a mutable automatically generatable field ('Auto' needs to be amongst the field's Sources). All other fields will be ignored.

PATCH /User/:Field/:ID
----------------------

- Req.session.User: Nees to be properly defined. Logged in user needs superuser Edit privileges.

- URL Parameters: 'Field' needs to identify a user (required and unique). All other fields will be ignored.

- Req.body.Update: 

The values for the fields that are to be updated. Fields not defined in UserSchema will be ignored.


DELETE /User/:Field/:ID
-----------------------

- Req.session.User: Nees to be properly defined. Logged in user needs superuser Delete privileges.

- URL Parameters: 'Field' needs to identify a user (required and unique). All other fields will be ignored.

GET /User/:Field/:ID
--------------------

- Req.session.User: Nees to be properly defined. Logged in user needs superuser Get privileges.

- URL Parameters: 'Field' needs to identify a user (required and unique). All other fields will be ignored.

PUT /User/:Field/:ID/Memberships/:Membership
--------------------------------------------

- Req.session.User: Nees to be properly defined. Logged in user needs superuser Edit privileges.

- URL Parameters: 

'Field' needs to identify a user (required and unique). All other fields will be ignored.

DELETE /User/:Field/:ID/Memberships/:Membership
-----------------------------------------------

- Req.session.User: Nees to be properly defined. Logged in user needs superuser Delete privileges.

'Field' needs to identify a user (required and unique). All other fields will be ignored.

Output to Other Components
==========================

express-user
------------

For brevity, the error routes and Res.locals.ExpressUser properties set by express-user won't be repeated here.

It is implied that whenever an error route is not triggered by express-user-local, express-user handles the request after express-user-local.

Read express-user documentation for more details.

Err.Source
----------

Whenever express-user-local triggers an error (ie, Next(Err)), the error has a source property with the source being "ExpressUserLocal".

Unless otherwise noted, Err.Source will be "ExpressUserLocal".

POST /Users
-----------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the new user with all the fields from Req.body.User that weren't ignored.

Additionally, if email verification is enabled, the email authentication field will be set with a value returned by its generator from the schema and Res.locals.ExpressUser.Generated will be defined as an array of one element listing the email authentication field.

- Error Behavior (Next(Err) is called)

If any fields don't pass validation (using the schema's validators) or if any required field is not included, Err.Type will have the value of 'BadField' and Err.Fields will contain all error fields.

If Req.body.User doesn't exist as an object, Err.Type will have the value of 'BadBody'.

PATCH /User/Self
----------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying and authentifying the user to update.

The Res.locals.ExpressUser.Update object is set and contains the fields that are to be updated.

Additionally, if email verification is enabled, the following will be set if 'EmailField' is among the fields to be updated:

The Res.locals.ExpressUser.Update object will contain a newly generated value for the email authentication field

Res.locals.ExpressUser.Generated will be defined as an array of one element listing the email authentication field.

Res.locals.ExpressUser.Memberships will be defined and have the value ```{'Remove': 'Validated'}```

- Error Behavior (Next(Err) is called)

If the user is not logged in, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

If the user didn't provide authentication in Req.body.User, Err.Type will have the value of 'NoAuth'.

If the user provides an authentication field tha doesn't pass schema validation, Err.Type will have the value of 'BadField' and Err.Fields will contain error fields related to authentication.

If the user doesn't specify any field to update in Req.body.Update (or only ignored fields), Err.Type will have the value of 'NoField'.

If any field in Req.body.Update doesn't pass schema validation, Err.Type will have the value of 'BadField' and Err.UpdateFields will contain all error fields related to updates.

If Req.body.User or Req.body.Update don't exist as objects, Err.Type will have the value of 'BadBody'.

Note: Currently, if there is both a validation error in the authentication field and in update fields, only the error in the authentication field will be reported.

DELETE /User/Self
-----------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying and authentifying the user to delete.

- Error Behavior (Next(Err) is called)

If the user is not logged in, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

If the user didn't provide authentication in Req.body.User, Err.Type will have the value of 'NoAuth'.

If the user provides an authentication field tha doesn't pass schema validation, Err.Type will have the value of 'BadField' and Err.Fields will contain error fields related to authentication.

If Req.body.User doesn't exist as an object, Err.Type will have the value of 'BadBody'.

GET /User/Self
--------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying the user to get.

If 'HideRestricted' was set to true in the options, the Res.locals.ExpressUser.Hide array will be set and will contain all fields that are secret or not user accessible ('Access' is not 'User').

- Error Behavior (Next(Err) is called)

If the user is not logged in, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

PUT /Session/Self/User
----------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying and authentifying the user to set in the session.

- Error Behavior (Next(Err) is called)

If no suitable identification field is provided in Res.locals.ExpressUser.User, Err.Type will have the value of 'NoID'.

If no suitable authentication field is provided in Res.locals.ExpressUser.User, Err.Type will have the value of 'NoAuth'.

If any field in Res.locals.ExpressUser.User doesn't pass schema validation, Err.Type will have the value of 'BadField' and Err.Fields will contain error fields related to authentication.

If Req.body.User doesn't exist as an object, Err.Type will have the value of 'BadBody'.

DELETE /Session/Self/User
-------------------------

- Normal Behavior

Res.locals.ExpressUser will be set to an empty object.

- Error Behavior (Next(Err) is called)

None. express-user handles the error if Req.session.User doesn't exist.

GET /Users/:Field/:ID/Count
---------------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields describing users to count.

- Error Behavior (Next(Err) is called)

If 'ID' of 'Field' in the url parameters doesn't pass schema validation, Err.Type will have the value of 'BadField' and Err.Fields will be an array containing the erronous field.

If 'Field' in the url parameters is not defined in UserSchema, Err.Type will have the value of 'NoField'.

If 'Field' in the url parameters is not public and the requesting user doesn't have superuser Get privileges, Err.Type will have the value of 'PrivateField'.

PUT /User/Self/Memberships/Validated
------------------------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying the user to operate on.

The Res.locals.ExpressUser.Membership property is set with the value of 'Validated'.

- Error Behavior (Next(Err) is called)

If the user is not logged in, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

If the email authentication field in Res.locals.ExpressUser.User doesn't pass schema validation, Err.Type will have the value of 'BadField' and Err.Fields will be an array containing the erronous field.

If no email authentication field is present in Res.locals.ExpressUser.User, Err.Type will have the value of 'NoAuth'.

If Req.body.User doesn't exist as an object, Err.Type will have the value of 'BadBody'.

POST /User/:Field/:ID/Recovery/:SetField
----------------------------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying the user to operate on.

The Res.locals.ExpressUser.Update object is set and contains a newly generated value for the property 'SetField' to update the user with.

Res.locals.ExpressUser.Generated will be defined as an array of one element listing the generated field.

- Error Behavior (Next(Err) is called)

If 'Field' is not a private identifying field, Err.Type will have the value of 'NoID'.

If 'ID' doesn't pass schema validation for 'Field', Err.Type will have the value of 'BadField' and Err.Fields will be an array containing the erronous field.

If 'SetField' is not a mutable user or email accessible field with auto generation, Err.Type will have the value of 'NoAuto'.

PATCH /User/:Field/:ID
----------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying the user to update.

The Res.locals.ExpressUser.Update object is set and contains the fields that are to be updated.

Additionally, if email verification is enabled, the following will be set if 'EmailField' is among the fields to be updated:

The Res.locals.ExpressUser.Update object will contain a newly generated value for the email authentication field, assuming that a new value wasn't already present in Res.locals.ExpressUser.Update.

Res.locals.ExpressUser.Memberships will be defined and have the value ```{'Remove': 'Validated'}```

If an email authentication field was generated in Res.locals.ExpressUser.Update, Res.locals.ExpressUser.Generated will be defined as an array of one element listing the field.

- Error Behavior (Next(Err) is called)

If the user is not logged in with Edit superuser privileges, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

If 'Field' is not an identifying field, Err.Type will have the value of 'NoID'.

If 'ID' doesn't pass schema validation for 'Field', Err.Type will have the value of 'BadField' and Err.Fields will be an array containing the erronous field.

If the user doesn't specify any field to update in Req.body.Update (or only ignored fields), Err.Type will have the value of 'NoField'.

If any field in Req.body.Update doesn't pass schema validation, Err.Type will have the value of 'BadField' and Err.UpdateFields will contain all error fields related to updates.

If Req.body.Update don't exist as objects, Err.Type will have the value of 'BadBody'.

DELETE /User/:Field/:ID
-----------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying the user to delete.

- Error Behavior (Next(Err) is called)

If the user is not logged in with Delete superuser privileges, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

If 'Field' is not an identifying field, Err.Type will have the value of 'NoID'.

If 'ID' doesn't pass schema validation for 'Field', Err.Type will have the value of 'BadField' and Err.Fields will be an array containing the erronous field.

GET /User/:Field/:ID
--------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying the user to get.

- Error Behavior (Next(Err) is called)

If the user is not logged in with Get superuser privileges, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

If 'Field' is not an identifying field, Err.Type will have the value of 'NoID'.

If 'ID' doesn't pass schema validation for 'Field', Err.Type will have the value of 'BadField' and Err.Fields will be an array containing the erronous field.

PUT /User/:Field/:ID/Memberships/:Membership
--------------------------------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying the user to operate on.

The Res.locals.ExpressUser.Membership property is set with the value of the 'Membership' parameter.

- Error Behavior (Next(Err) is called)

If the user is not logged in with Edit superuser privileges, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

If 'Field' is not an identifying field, Err.Type will have the value of 'NoID'.

If 'ID' doesn't pass schema validation for 'Field', Err.Type will have the value of 'BadField' and Err.Fields will be an array containing the erronous field.

DELETE /User/:Field/:ID/Memberships/:Membership
-----------------------------------------------

- Normal Behavior

The Res.locals.ExpressUser.User object is set and contains the fields identifying the user to operate on.

The Res.locals.ExpressUser.Membership property is set with the value of the 'Membership' parameter.

- Error Behavior (Next(Err) is called)

If the user is not logged in with Delete superuser privileges, express-access-control will set Err.Source to 'ExpressAccessControl' and Err.Type to 'NoAccess'.

If 'Field' is not an identifying field, Err.Type will have the value of 'NoID'.

If 'ID' doesn't pass schema validation for 'Field', Err.Type will have the value of 'BadField' and Err.Fields will be an array containing the erronous field.

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

1.1.1
-----

Added missing doc and test for POST /User/:Field/:ID/Recovery/:SetField route with regard to setting Res.locals.ExpressUser.Generated.

1.1.0
-----

Added Res.locals.ExpressUser.Generated list when fields are automatically generated, to better convey it to the responder.

1.0.2
-----

- Finished documentation
- Added tests for GET /Users/:Field/:ID/Count route with admin routes disabled
- Fixed crash for GET /Users/:Field/:ID/Count route when admin routes are disabled

1.0.1
-----

More documentation.

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





















