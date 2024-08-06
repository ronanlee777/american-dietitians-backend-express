const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const client = require("../config/db/db.js");
const getToken = require("../config/utils/getToken");
const { emailExists, firstUser } = require("../config/helper.js");
const jwt = require("jsonwebtoken");
const emailjs = require('@emailjs/nodejs');
const config = require("../config/config");

exports.register = async (req, res) => {
    try {
        const { first_name, last_name, email, password } = req.body;
        const userExists = await emailExists(email);
        const isFirstUser = await firstUser();
        const created_at = new Date();
        const formattedDate = created_at.toISOString();
        if (!userExists) {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            const manageRole = isFirstUser ? "admin" : "user";
            const data = await client.query(
                "INSERT INTO dietitians(email, password, first_name, last_name, created_at, manage_role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, password, first_name, last_name, created_at, manage_role",
                [email, hash, first_name, last_name, formattedDate, manageRole]
            );
            if (data.rowCount === 0) res.status(201).send("Insert Error!")
            else {
                const token = getToken(data.rows[0]);
                const flag = await this.sendVerifyEmail(token, data.rows[0]);
                if (flag) {
                    console.log(flag, token);
                    await res.status(200).send({
                        token: token,
                        user: data.rows[0]
                    });
                }
                else res.status(203).send("Email Send Error!")
            }
        }
        else res.status(202).send("This user already exists!");
    }
    catch {
        res.status(501).send("Server error")
    }
}

exports.sendVerifyEmail = async (token, user) => {
    try {
        const st = token.split(".");
        const sendToken = `?firstpart=${st[0]}&secondpart=${st[1]}&thirdpart=${st[2]}`;
        const templateParams = {
            to_name: user.first_name + " " + user.last_name,
            from_name: "American Dietitian",
            recipient: user.email,
            message: "http://localhost:5173/user/verify/token" + sendToken
        };
        const serviceID = "service_z4nls6p";
        const templateID = "template_cbzetnk";
        const userID = {
            publicKey: 'lfNyYMLdX7ikJM5Eq',
            privateKey: 'YSiwbwwHa_ZAde0VTzVpb'
        }
        const response = await emailjs.send(serviceID, templateID, templateParams, userID);
        console.log(user.email, 'verify email send success', response.status, response.text);
        return true;
    }
    catch (err) {
        console.log(user.email, 'verify email send failed', err);
        return false;
    }
}

exports.sendVerifyCode = async (req, res) => {
    try {
        const randomNumber = crypto.randomInt(100000, 1000000);
        const data = await client.query(
            `UPDATE dietitians SET verify_code = ${randomNumber} WHERE email = '${req.body.email}' RETURNING *`
        )
        if (data.rowCount === 0) res.status(201).send("You are not registered. Please sign up with your email.");
        else {
            const templateParams = {
                to_name: data.rows[0].first_name + " " + data.rows[0].last_name,
                from_name: "American Dietitian",
                recipient: req.body.email,
                message: randomNumber
            };
            const serviceID = "service_z4nls6p";
            const templateID = "template_tekavzu";
            const userID = {
                publicKey: 'lfNyYMLdX7ikJM5Eq',
                privateKey: 'YSiwbwwHa_ZAde0VTzVpb'
            }
            const response = await emailjs.send(serviceID, templateID, templateParams, userID);
            console.log(req.body.email, 'verify code send success', response.status, response.text);
            res.status(200).send("success");
        }
    }
    catch (err) {
        console.log(req.body.email, 'verify code send failed', err);
        res.status(501).send("Server Error");
    }
}

exports.checkVerifyCode = async (req, res) => {
    try {
        const data = await client.query(
            `SELECT * FROM dietitians WHERE email = '${req.body.email}'`
        );
        if (data.rowCount === 0) res.status(201).send("Database Error");
        else {
            if (req.body.verifyCode === data.rows[0].verify_code) {
                res.status(200).send("ok");
            }
            else res.status(202).send("Verify Code Invalid");
        }
    }
    catch {
        res.status(501).send("Server Error");
    }
}

exports.changePassword = async (req, res) => {
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(req.body.password, salt);

        const data = await client.query(
            `UPDATE dietitians SET password = '${hash}'  WHERE email = '${req.body.email}'`
        );
        if (data.rowCount === 0) res.status(201).send("Database Error");
        else {
            res.status(200).send("ok");
        }
    }
    catch {
        res.status(501).send("Server Error");
    }
}

exports.sendEmail = async (req, res) => {
    try {
        const flag = await this.sendVerifyEmail(req.body.token, req.body.user);
        if (flag) res.status(200).send("ok");
    }
    catch {
        res.status(501).send("failed");
    }
}

exports.tokenVerification = async (req, res) => {
    try {
        let { token } = req.body;
        jwt.verify(token, config.secret, async (err, payload) => {
            if (err) return res.status(401).send("Unauthorized.");
            else {
                const data = await client.query(
                    `UPDATE dietitians SET verify = TRUE WHERE id = ${payload.id} RETURNING *`
                )
                if (data.rowCount === 0) res.status(201).send("Failed.");
                else {
                    await res.status(200).send({
                        token: getToken(data.rows[0]),
                        user: data.rows[0]
                    })
                }
            }
        });
    }
    catch {
        res.send("Server error");
    }
}

exports.login = async (req, res) => {
    try {
        const data = await client.query(
            `SELECT * FROM dietitians WHERE id = ${req.user.id}`
        );
        if (data.rows[0].verify) {
            await res.status(200).send({
                token: getToken(data.rows[0]),
                user: data.rows[0]
            });
        }
        else {
            const token = getToken(data.rows[0]);
            const flag = await this.sendVerifyEmail(token, data.rows[0]);
            if (flag) await res.status(201).send({
                token: token,
                user: data.rows[0]
            });
        }
    }
    catch {
        res.status(501).send("Server error")
    }
}

exports.loginWithToken = async (req, res) => {
    try {
        let { token } = req.body;
        jwt.verify(token, config.secret, async (err, payload) => {
            if (err) return res.status(401).send("Unauthorized.");
            else {
                const data = await client.query(
                    `SELECT * FROM dietitians WHERE id = ${payload.id}`
                );
                if (data.rowCount === 0) res.status(201).send("No User Exist");
                else res.status(200).send({
                    token: getToken(data.rows[0]),
                    user: data.rows[0]
                })
            }
        });
    }
    catch {
        res.send("Server error")
    }
}

exports.paymentSet = async (req, res) => {
    const plan = req.body.plan;
    let tempDate;
    const myDate = new Date();
    const formattedDate = myDate.toISOString();

    if (plan === 2 && req.user.plan && req.user.payment_date) {
        tempDate = req.user.payment_date;
    }
    else {
        tempDate = formattedDate;
    }
    const data = await client.query(
        `UPDATE dietitians SET payment_date = '${tempDate}' 
         WHERE id = ${req.user.id} RETURNING *`
    )
    if (data.rowCount === 0) res.status(201).send("update error!");
    else {
        res.status(200).send(data.rows[0]);
    }
}

exports.setupProfileStep1 = async (req, res) => {

    try {
        const data = await client.query(
            `UPDATE dietitians SET first_name = $1,
            last_name = $2,
            profile_name = $3,
            apt_suite = $4,
            city_name = $5,
            business_email = $6,
            office_fax = $7,
            office_number = $8,
            role = $9,
            state = $10,
            street_address = $11,
            website_url = $12,
            zipcode = $13
            WHERE id = ${req.user.id} RETURNING *`,
            [
                req.body.first_name, req.body.last_name, req.body.profile_name, req.body.apt_suite, req.body.city_name,
                req.body.business_email, req.body.office_fax, req.body.office_number, req.body.role, req.body.state,
                req.body.street_address, req.body.website_url, req.body.zipcode
            ]
        )
        if (data.rowCount === 0) res.status(201).send("Failed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.status(501).send("Server Error")
    }
}

exports.setupProfileStep2 = async (req, res) => {
    try {
        const data = await client.query(
            `UPDATE dietitians SET facebook = $1,  
            instagram = $2,
            twitter = $3,
            summary = $4,
            avatar = $5,
            working_time = $6,
            education = $7
            WHERE id = ${req.user.id} RETURNING *`,
            [req.body.facebook, req.body.instagram, req.body.twitter, req.body.summary, req.body.avatar, req.body.working_time, JSON.stringify(req.body.education)]
        )
        if (data.rowCount === 0) res.status(201).send("Filed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.status(501).send("Server Error")
    }
}

exports.profileSubmit = async (req, res) => {
    try {
        const user = await client.query(
            `SELECT * FROM dietitians WHERE id = ${req.user.id}`
        );
        const myDate = new Date();
        const formattedDate = myDate.toISOString();
        const data = await client.query(
            `UPDATE dietitians SET submit_at = '${user.submit_at && user.submit_at !== "null" ? user.submit_at : formattedDate}'       
            WHERE id = ${req.user.id} RETURNING *`
        )
        if (data.rowCount === 0) res.status(201).send("Filed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.send("Server Error")
    }
}

exports.uploadAvatar = async (req, res) => {
    res.send("ok");
}

exports.subscribe = async (req, res) => {
    try {
        const data = await client.query("SELECT * FROM subscribers WHERE email=$1", [
            req.body.email,
        ]);
        if (data.rowCount > 0) res.status(201).send("Exist");
        else {
            const insertData = await client.query(
                `INSERT INTO subscribers(email) VALUES ($1)`,
                [req.body.email]
            )
            if (insertData.rowCount > 0) res.status(200).send("ok");
            else res.status(501).send("Failed");
        }
    }
    catch {
        res.status(501).send("Failed");
    }
}

exports.changeContactInfo = async (req, res) => {
    try {
        const data = await client.query(
            `UPDATE dietitians SET 
            city_name = $1,
            business_email = $2,
            office_fax = $3,
            office_number = $4,
            state = $5
            WHERE id = ${req.user.id} RETURNING *`,
            [req.body.city_name, req.body.business_email, req.body.office_fax, req.body.office_number, req.body.state]
        )
        if (data.rowCount === 0) res.status(201).send("Failed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.status(501).send("Server Error")
    }
}

exports.changeWorkingTime = async (req, res) => {
    try {
        const data = await client.query(
            `UPDATE dietitians SET 
            working_time = $1
            WHERE id = ${req.user.id} RETURNING *`,
            [req.body.working_time]
        )
        if (data.rowCount === 0) res.status(201).send("Failed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.status(501).send("Server Error")
    }
}

exports.changeAvatar = async (req, res) => {
    try {
        const data = await client.query(
            `UPDATE dietitians SET facebook = $1,  
            instagram = $2,
            twitter = $3,
            avatar = $4
            WHERE id = ${req.user.id} RETURNING *`,
            [req.body.facebook, req.body.instagram, req.body.twitter, req.body.avatar]
        )
        if (data.rowCount === 0) res.status(201).send("Failed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.status(501).send("Server Error")
    }
}

exports.changeTitleWebsite = async (req, res) => {
    try {
        const data = await client.query(
            `UPDATE dietitians SET   
            role = $1,
            profile_name = $2,
            website_url = $3
            WHERE id = ${req.user.id} RETURNING *`,
            [req.body.role, req.body.profile_name, req.body.website_url]
        )
        if (data.rowCount === 0) res.status(201).send("Failed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.status(501).send("Server Error")
    }
}

exports.changeSummary = async (req, res) => {
    try {
        const data = await client.query(
            `UPDATE dietitians SET   
            summary = $1
            WHERE id = ${req.user.id} RETURNING *`,
            [req.body.summary]
        )
        if (data.rowCount === 0) res.status(201).send("Failed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.status(501).send("Server Error")
    }
}

exports.changeEducation = async (req, res) => {
    try {
        const data = await client.query(
            `UPDATE dietitians SET   
            education = $1
            WHERE id = ${req.user.id} RETURNING *`,
            [JSON.stringify(req.body.education)]
        )
        if (data.rowCount === 0) res.status(201).send("Failed");
        else {
            res.status(200).send(data.rows[0]);
        }
    }
    catch {
        res.status(501).send("Server Error")
    }
}