# Local Authentication Ergo

Tiny user management with SQLite. Lauer performs all the usual operations: creating users, login, verification, password reset and storing data.
It's lightweigt and portable. 

## Install

```
npm install lauer
```

## Example

```javascript

var lauer = require("lauer");

var users = new lauer({db: "/tmp/lauer.sqlite"});

users.create({
	username: "user1",
	email: "user@example.com",
	password: "gu3ssme!1",
	verfified: 1,
}, function(err, result){

	console.log(err, result);

	users.login("user1", "gu3ssme!1", function(err, result){
		
		console.log(err, result);

	});
	
});
```

## API

### lauer(opts, function(err){})

Create a new instance of `Lauer`. `opts`:

```javascript
{
	iterations: 4096,   // number of iterations used by `pbkdf2`
	db: "lauer.sqlite"  // path to sqlite database
}
```

### lauer.salt()

Create and return a random salt.

### lauer.password(username, password, salt)

Create and return a salted password hash.

### lauer.slug(str)

Slugify a string.

### lauer.create(user, function(err, result){})

Create a user. `user`:

```javascript
{
	username: "user1",          // user name
	email: "user@example.com",  // email address
	password: "gu3ssme!1",      // password
	verfified: 0,               // 0 = user pending verfication, 1 = instantly active (see lauer.verify)
	level: 0,                   // level (may be used by you to dertemine wo is an admin)
	data: {}                    // user-defined data object
}
```

`result`:

```javascript
{
	id: 1,                      // user id
	username: "user1",          // user name
	verification: "<hexstr>"    // verification string (see lauer.verify)
}
```

### lauer.get(id||username, function(err, result){})

Get a user object. The first parameter may be an `id` or `username`.

`result`:
```javasctipt
{
	id: 1,                      // user id
	username: "user1",          // user name
	email: "user@example.com",  // email
	verified: 0,                // verification status (0 = false, 1 = true)
	level: 0,                   // level (may be used by you to dertemine wo is an admin)
	created: 1234567890,        // time user was created
	updated: 1234567890,        // time user was last changed
	lastlogin: 1234567890,      // time of last login
	data: {}                    // user-defined data object
}
```

### lauer.login(username||email, password, function(err, result){})

Get a user object. The first parameter may be `username` or `email`.

`result`:
```javasctipt
{
	id: 1,                      // user id
	username: "user1",          // user name
	level: 0,                   // level (may be used by you to dertemine wo is an admin)
	lastlogin: 1234567890       // time of last login
}
```

### lauer.delete(id, function(err){})

Delete user with `id`.

### lauer.verify(verification, function(err, result){})

Verify user with `verification`. If verfification is successful, `verified` will be set to 1 and the user may log in.

`result`:
```javasctipt
{
	id: 1,                      // user id
	username: "user1",          // user name
	level: 0,                   // level (may be used by you to dertemine wo is an admin)
	lastlogin: 1234567890       // time of last login
}
```

### lauer.reset(id||username, function(err, result){})

Reset verification and create new verification string.

`result`:
```javasctipt
{
	id: 1,                      // user id
	username: "user1",          // user name
	email: "user@example.com",  // email
	verification: "<hexstr>"    // verification string (see lauer.verify)
}
```

### lauer.verification(id||username, function(err, result){})

Create new verification string without resetting verification. Useful for changing forgotten passwords.

`result`:
```javasctipt
{
	id: 1,                      // user id
	username: "user1",          // user name
	email: "user@example.com",  // email
	verification: "<hexstr>"    // verification string (see lauer.verify)
}
```

### lauer.check(username, function(err){})

Check if a `username` is available.

### lauer.change(username||email, verification||current_password, new_password, function(err, result){})

Change password for a user identified by `username` or `email`. 
The second parameter may either be the users current password or a verification tring created by `lauer.verification`.

`result`:
```javasctipt
{
	id: 1,                      // user id
	username: "user1"           // user name
}
```

### lauer.data(id||username, data, function(err){})

Change user data.

`result`:
```javasctipt
{
	id: 1,                      // user id
	username: "user1"           // user name
}
```

## License

[Public Domain](http://unlicense.org/UNLICENSE).
