module.exports = function (RED) {
	var POP3Client = require('poplib');
	const simpleParser = require('mailparser').simpleParser;
	var debug = false;
	var tls = false;
	var totalmsgcount = 0;
	var currentmsg = 0;

	function Pop3Node(config) {
		RED.nodes.createNode(this, config);

		this.host = config.server;
		this.port = config.port;
		var flag = false;

		if (this.credentials && this.credentials.hasOwnProperty("userid")) {
			this.userid = this.credentials.userid;
		} else {
			if (globalkeys) {
				this.userid = globalkeys.user;
				flag = true;
			}
		}

		if (this.credentials && this.credentials.hasOwnProperty("password")) {
			this.password = this.credentials.password;
		} else {
			if (globalkeys) {
				this.password = globalkeys.pass;
				flag = true;
			}
		}

		if (flag) {
			RED.nodes.addCredentials(config.id, { userid: this.userid, password: this.password, global: true });
		}

		var node = this;

		this.on("input", function (msg) {

			var client = new POP3Client(node.port, node.host, {
				tlserrs: false,
				enabletls: false,
				debug: false
			});

			client.on("error", function (err) {
				if (err.errno === 111) console.log("Unable to connect to server, failed");
				else console.log("Server error occurred, failed");
				console.log(err);
			});

			client.on("connect", function () {
				//console.log("CONNECT success");
				client.login(node.userid, node.password);
			});

			client.on("invalid-state", function (cmd) {
				console.log("Invalid state. You tried calling " + cmd);
			});

			client.on("locked", function (cmd) {
				console.log("Current command has not finished yet. You tried calling " + cmd);
			});

			client.on("login", function (status, rawdata) {
				if (status) {
					//console.log("LOGIN/PASS success");
					client.list();
				} else {
					console.log("LOGIN/PASS failed");
					client.quit();
				}
			});

			client.on("list", function (status, msgcount, msgnumber, data, rawdata) {
				if (status === false) {
					console.log("LIST failed");
					client.quit();
				} else if (msgcount > 0) {
					totalmsgcount = msgcount;
					currentmsg = 1;
					//console.log("LIST success with " + msgcount + " message(s)");
					client.retr(1);
				} else {
					console.log("LIST success with 0 message(s)");
					client.quit();
				}
			});

			client.on("retr", function (status, msgnumber, data, rawdata) {
				if (status === true) {
					currentmsg += 1;
					simpleParser(data)
						.then(mail => {
							msg.payload = mail;
							node.send(msg);
						})
						.catch(err => {
							console.log(err);
						});

					if (currentmsg > totalmsgcount) {
						client.rset();
					} else {
						client.retr(currentmsg);
						// client.rset();
					}
				} else {
					console.log("RETR failed for msgnumber " + msgnumber);
					client.rset();
				}
			});

			client.on("dele", function (status, msgnumber, data, rawdata) {
				if (status === true) {
					//console.log("DELE success for msgnumber " + msgnumber);
					if (currentmsg > totalmsgcount)
						client.quit();
					else
						client.retr(currentmsg);
				} else {
					console.log("DELE failed for msgnumber " + msgnumber);
					client.rset();
				}
			});

			client.on("rset", function (status, rawdata) {
				client.quit();
			});

			client.on("quit", function (status, rawdata) {
				if (status === true) {
					//console.log("QUIT success");
				}
				else {
					console.log("QUIT failed");
				}
			});
		});
	}
	RED.nodes.registerType("pop3-rcv-keep-mail", Pop3Node, {
		credentials: {
			userid: { type: "text" },
			password: { type: "password" },
			global: { type: "boolean" }
		}
	}
	);
};
