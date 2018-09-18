#!/usr/bin/env node

var sqlite3 = require("sqlite3").verbose();
var debug = require("debug")("lauer");
var crypto = require("crypto");
var path = require("path");
var slug = require("mollusc");
var fs = require("fs");

function lauer(opts, fn){

	// it this is not an instance od lauer, make it one
	if (!(this instanceof lauer)) return new lauer(lauer, fn);

	// copy this to keep it in scope
	var self = this;

	// keep opts in instance
	self.opts = opts;

	// hashing iterations number
	if (!self.opts.hasOwnProperty("iterations") || (typeof self.opts.iterations !== "number") || self.opts.iterations < 4096) self.opts.iterations = 4096;

	// check for db file option or fall back on default
	if (!self.opts.hasOwnProperty("db") || typeof self.opts.db !== "string" || self.opts.db === "") {
		self.opts.db = path.resolve(path.dirname(require.main.filename), "lauer.sqlite");
	};

	// ready state
	self.ready = false;

	// just to be on the safe side
	self.christopher = false;

	self.init(function(err){
		if (err) return debug("error initializing database") || fn(err)
		self.ready = true;
		debug("database ready");
		fn(err);
	});

	return this;
};

// initialize database
lauer.prototype.init = function(fn){
	var self = this;
	
	// check if database exists
	fs.exists(self.opts.db, function(ex){
		if (ex) {
			// open database
			debug("opening database");
			self.db = new sqlite3.Database(self.opts.db, function(err){
				fn(err, false);
			});
		} else {
			// create database
			debug("creating new database");
			self.db = new sqlite3.Database(self.opts.db, function(err){
				if (err) return fn(err);
				self.db.run('CREATE TABLE "users" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL UNIQUE, "username" TEXT NOT NULL UNIQUE, "password" TEXT NOT NULL, "salt" TEXT NOT NULL, "email" TEXT UNIQUE NOT NULL, "verification" TEXT UNIQUE, "verified" INTEGER NOT NULL, "created" INTEGER, "updated" INTEGER, "lastlogin" INTEGER, "level" INTEGER, "data" BLOB);', function(err){
					fn(err, true);
				});
			});
		};
	});
	
	return this;
};

// generate salt
lauer.prototype.salt = function(){
	return (new Buffer(crypto.randomBytes(32 >> 1))).toString('hex');
};

// hash password
lauer.prototype.password = function(username, password, salt){
	var self = this;
	return crypto.pbkdf2Sync(JSON.stringify([username,password]), salt, self.opts.iterations, 64 >> 1, "sha256").toString('hex');
};

// create slug
lauer.prototype.slug = function(str){
	return slug(str.toLowerCase(), "_");
};

// create a new user
lauer.prototype.create = function(user, fn){
	var self = this;

	var values = {};

	// checks username
	if (!user.hasOwnProperty("username") || typeof user.username !== "string" || user.username === "") return fn(new Error("no username specified"));
	user.username = self.slug(user.username);
	if (!/^[a-z0-9\_\-\.]+$/.test(user.username)) return fn(new Error("no username specified"));

	// check email
	if (!user.hasOwnProperty("email") || typeof user.email !== "string" || user.email === "") return fn(new Error("no email specified"));
	user.email = user.email.toLowerCase();

	// check password
	if (!user.hasOwnProperty("password") || typeof user.password !== "string" || user.password.length < 8) return fn(new Error("no valid password specified"));

	// check level and make integer
	if (!user.hasOwnProperty("level") || typeof user.level !== "number") user.level = 0;
	user.level = (user.level | 0);

	// data
	values["$username"] = user.username;
	values["$email"] = user.email;
	values["$salt"] = self.salt();
	values["$password"] = self.password(user.username, user.password, values["$salt"]);
	values["$level"] = user.level;

	// check verification
	if (user.verified === true) {
		values["$verification"] = null;
		values["$verified"] = 1;
	} else {
		values["$verification"] = self.salt();
		values["$verified"] = 0;
	};
	
	if (user.hasOwnProperty("data")) {
		values["$data"] = JSON.stringify(user.data);
	} else {
		values["$data"] = "{}";
	};
	
	// dates
	values["$created"] = ((Date.now() / 1000) | 0);
	values["$updated"] = ((Date.now() / 1000) | 0);
	values["$lastlogin"] = null;

	self.db.run("INSERT INTO users (username, password, salt, email, verification, verified, created, updated, lastlogin, level, data) VALUES ($username, $password, $salt, $email, $verification, $verified, $created, $updated, $lastlogin, $level, $data)", values, function(err, result){
		if (err) return fn(err);
		return fn(null, {
			id: this.lastID,
			username: values["$username"],
			verification: values["$verification"]
		});
	});
	return this;
};

// get a user
lauer.prototype.get = function(id, fn){
	var self = this;
	
	switch (typeof id) {
		case "number": var sql = "SELECT id, username, email, verified, level, created, updated, lastlogin, data FROM users WHERE id = ?"; break;
		case "string": var sql = "SELECT id, username, email, verified, level, created, updated, lastlogin, data FROM users WHERE username = ?"; break;
		default: return fn(new Error("first argument must be username or id")); break;
	};
	
	self.db.get(sql, id, function(err, row){
		if (err) return fn(err);
		if (typeof row === "undefined") return fn(new Error("no such user"));

		// deserialize data
		try {
			row.data = JSON.parse(row.data);
		} catch(err) { return fn(err); };
		
		fn(null, row);
	});
	
	return this;
};

// login a user
lauer.prototype.login = function(username, password, fn){
	var self = this;
	self.db.get("SELECT id, username, password, salt, level, lastlogin FROM user WHERE (username = ? OR email = ?) AND verified = 1", [username, username], function(err, row){
		if (err) return fn(err);
		if (typeof row === "undefined") return fn(new Error("user does not exist"));
		
		// check password
		if (row.password !== self.password(row.username, password, row.salt)) return fn(new Error("password does not match"));
		
		// update lastlogin
		self.db.run("UPDATE users SET lastlogin = ? WHERE id = ?", [(Date.now()/1000|0), row.id]);
				
		// call back with data
		fn(null, {
			id: row.id,
			username: row.username,
			level: row.level,
			lastlogin: row.lastlogin
		});
		
	});
	return this;
};

// delete a user
lauer.prototype.delete = function(id, fn){
	var self = this;
	self.db.run("DELETE FROM users WHERE id = ?", id, function(err){
		if (err) return fn(err);
		if (this.changes !== 1) return fn(new Error("this user did not exist"));
		fn(null);
	});
	return this;
};

// verify a user
lauer.prototype.verify = function(verification, fn){
	var self = this;
	self.db.get("SELECT id, username, email, level FROM users WHERE verification = ?", [verification], function(err, row){
		if (err) return fn(err);
		if (typeof row === "undefined") return fn(new Error("verification failed"));
		
		// update verification
		self.db.run("UPDATE users SET verification = null, verified = 1 WHERE id = ?", [row.id], function(err){
			if (err) return fn(err);
			
			// call back with data
			fn(null, {
				id: row.id,
				username: row.username,
				level: row.level,
				lastlogin: null
			});
			
		});
		
	});
	return this;
};

// reset verification
lauer.prototype.reset = function(id, fn){
	var self = this;
	
	// get user
	self.get(id, function(err, user){
		if (err) return fn(err);

		// generate verification
		var verification = self.salt();

		self.db.run("UPDATE users SET verification = ?, verified = 0 WHERE id = ?", [verification, user.id], function(err){
			if (err) return fn(err);
			if (this.changes !== 1) return fn(new Error("this user does not exist"));
			fn(null, {
				id: user.id,
				username: user.username,
				email: user.email,
				verification: verification
			});

		});
		
	});
	
	return this;
};

// get new verification coude without unverifying
lauer.prototype.verification = function(id, fn){
	var self = this;
	
	// get user
	self.get(id, function(err, user){
		if (err) return fn(err);

		// generate verification
		var verification = self.salt();

		self.db.run("UPDATE users SET verification = ? WHERE id = ?", [verification, user.id], function(err){
			if (err) return fn(err);
			if (this.changes !== 1) return fn(new Error("this user does not exist"));
			fn(null, {
				id: user.id,
				username: user.username,
				email: user.email,
				verification: verification
			});

		});
		
	});
	
	return this;
};

// check if a username is available
lauer.prototype.check = function(username, fn){
	var self = this;
	self.db.get("SELECT id FROM users WHERE username = ?", [username], function(err, row){
		if (err) return fn(err);
		fn(null, (typeof row !== "undefined"));
	});
	return this;
};

// change password
lauer.prototype.change = function(username, verification, password, fn){
	var self = this;
	self.db.get("SELECT id, username, password, verification, salt FROM users WHERE (username = ? OR email = ?)", [username, username], function(err, row){
		if (err) return fn(err);
		if (typeof row === "undefined") return fn(new Error("no such user"));
		
		// check password
		if (row.verification !== verification && row.password !== self.password(row.username, verification, row.salt)) return fn(new Error("password or verification does not match"));
		
		// check if change was made by verification
		var verified = (row.verification === verification) ? 1 : 0;
		
		// change password
		var salt = self.salt();
		var password = self.password(row.username, password, salt);
		
		self.db.run("UPDATE users SET password = ?, salt = ?, verfification = null, verified = ?, updated = ? WHERE id = ?", [password, salt, verified, (Date.now()/1000|0), row.id], function(err){
			if (err) return fn(err);
			if (typeof this.changes !== 1) return fn(new Error("changing password failed"));
			fn(null, {
				id: row.id,
				username: row.username
			});
		});
		
	});
	return this;
};

// update data
lauer.prototype.data = function(id, data, fn){
	
	// check id type
	switch (typeof id) {
		case "number": var sql = "UPDATE users SET data = ?, updated = ?, WHERE id = ?"; break;
		case "string": var sql = "UPDATE users SET data = ?, updated = ?, WHERE username = ?"; break;
		default: return fn(new Error("first argument must be id or username")); break;
	};

	// prepare data
	var data = JSON.stringify(data);
	
	self.db.run(sql, [data, (Date.now()/1000|0), id], function(err){
		if (err) return fn(err);
		if (typeof this.changes !== 1) return fn(new Error("updating failed"));
		fn(null, {
			id: row.id,
			username: row.username
		});
	});
};

module.exports = lauer;
