// database connection
const dbconnection = require("../Database/databaseconfig");
const { v4: uuidv4 } = require("uuid");

async function get_all_questions(req, res) {
  try {
    // Changed: [rows] → { rows }, DATE_FORMAT → TO_CHAR, is_deleted = 0 → FALSE
    const { rows } = await dbconnection.query(
      `SELECT 
         questions.questionid, 
         questions.userid, 
         questions.title, 
         questions.tag, 
         questions.description,
         users.username, 
         TO_CHAR(questions.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
       FROM questions
       INNER JOIN users ON questions.userid = users.userid
       WHERE questions.is_deleted = FALSE
       ORDER BY questions.created_at ASC`
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No questions found",
      });
    }

    res.status(200).json({
      status: "success",
      total_questions: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "Internal server error while fetching questions",
      error: error.message,
    });
  }
}

async function get_single_question(req, res) {
  const { questionid } = req.params; // path variable

  // Validate questionid
  if (!questionid) {
    return res.status(400).json({
      status: "error",
      message: "Invalid or missing question_id.",
    });
  }

  try {
    // Changed: [rows] → { rows }, ? → $1, is_deleted = 0 → FALSE
    const { rows } = await dbconnection.query(
      `SELECT questions.questionid, questions.userid, questions.title, questions.tag, questions.description,
             users.username
      FROM questions
      INNER JOIN users ON questions.userid = users.userid
      WHERE questions.questionid = $1 AND questions.is_deleted = FALSE
    `,
      [questionid]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Question not found",
      });
    }

    // Return the single question
    res.status(200).json({
      status: "success",
      data: rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "Internal server error while fetching the question",
      error: error.message,
    });
  }
}

async function post_question(req, res) {
  const { title, tag, description } = req?.body;

  // 1. Validate request body
  if (!title || title.trim() === "") {
    return res.status(400).json({
      status: "error",
      message: "Title is required.",
    });
  }
  if (!description || description.trim() === "") {
    return res.status(400).json({
      status: "error",
      message: "Description is required.",
    });
  }

  if (!tag || tag.trim() === "") {
    return res.status(400).json({
      status: "error",
      message: "Tag is required.",
    });
  }

  try {
    // 2. Insert new question
    // Changed: [result] → { rows }, ? → $1, $2, $3, $4, $5, added RETURNING *
    const questionid = uuidv4();
    const { rows } = await dbconnection.query(
      `INSERT INTO questions (questionid, userid, title, tag, description) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [questionid, req.user.userid, title, tag, description]
    );

    // 3. Respond with 201 Created
    res.status(201).json({
      status: "success",
      message: "Question created successfully",
      data: {
        questionid: rows[0].questionid,
        userid: rows[0].userid,
        title,
        tag,
        description,
      },
    });
  } catch (error) {
    console.error(error);
    // 4. Server error handling
    res.status(500).json({
      status: "error",
      message: "Server error while creating question",
      error: error.message,
    });
  }
}

async function update_question(req, res) {
  const { questionid } = req.params;
  const { title, description } = req.body;
  const userid = req.user.userid;

  try {
    // Changed: [rows] → { rows }, ? → $1, is_deleted = 0 → FALSE
    const { rows } = await dbconnection.query(
      "SELECT * FROM questions WHERE questionid = $1 AND is_deleted = FALSE",
      [questionid]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "fail",
        message: "Question not found or already deleted",
      });
    }

    if (rows[0].userid !== userid) {
      return res.status(403).json({
        status: "fail",
        message: "You are not allowed to update this question",
      });
    }

    // Update the question - Changed: ? → $1, $2, $3
    await dbconnection.query(
      "UPDATE questions SET title = $1, description = $2 WHERE questionid = $3",
      [title || rows[0].title, description || rows[0].description, questionid]
    );

    return res.json({
      status: "success",
      message: "Question updated successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "fail", message: "Server error" });
  }
}

// Soft Delete a question
async function delete_question(req, res) {
  const { questionid } = req.params;
  const userid = req.user.userid;

  try {
    // Changed: [rows] → { rows }, ? → $1, is_deleted = 0 → FALSE
    const { rows } = await dbconnection.query(
      "SELECT * FROM questions WHERE questionid = $1 AND is_deleted = FALSE",
      [questionid]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "fail",
        message: "Question not found or already deleted",
      });
    }

    if (rows[0].userid !== userid) {
      return res.status(403).json({
        status: "fail",
        message: "You are not allowed to delete this question",
      });
    }

    // Soft delete - Changed: ? → $1, is_deleted = 1 → TRUE
    await dbconnection.query(
      "UPDATE questions SET is_deleted = TRUE WHERE questionid = $1",
      [questionid]
    );

    return res.json({
      status: "success",
      message: "Question deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "fail", message: "Server error" });
  }
}

module.exports = {
  get_all_questions,
  get_single_question,
  post_question,
  update_question,
  delete_question,
};
