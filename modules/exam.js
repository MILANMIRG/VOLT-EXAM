const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            required: true
        },

        text: {
            type: String,
            required: true
        },

        options: {
            type: [String],
            required: true
        },

        correct: {
            type: Number,
            required: true
        },

        marks: {
            type: Number,
            default: 1
        }
    },
    {
        _id: false
    }
);


const examSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true
        },

        subject: {
            type: String,
            default: ""
        },

        duration: {
            type: Number,
            required: true
        },

        questions: {
            type: [questionSchema],
            required: true
        }
    },
    {
        timestamps: true
    }
);


module.exports =
    mongoose.model("Exam", examSchema);