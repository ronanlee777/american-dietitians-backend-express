var passport = require("passport"),
    requireAuth = passport.authenticate("jwt", { session: false }),
    router = require("express").Router(),
    doctorCtr = require("../controllers/doctors.controller");

router.post("/get-doctors-list", doctorCtr.getDoctorsList);
router.post("/getItembyId", doctorCtr.getItembyId);

module.exports = router;