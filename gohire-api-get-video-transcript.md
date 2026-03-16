# Goal
从我们对接【一键邀约接口】， InviteAgent.ts 中响应的 json 结构中获取到 requestId or request_introduction_id（这个在对接的接口中已经返回），然后通过下面的curl接口获取视频地址和简历下载地址以及对话记录，这样是最快的获取到视频地址，简历地址，对话记录

in 安排面试，store the returned request id along with each candidate interview record, and use that to retrieve the address of the video mp4 file and the transcript file, following this document : @gohire-api-get-video-transcript.md  .

we will then display the video, transcript, and run evaluation in /product/evaluations. see attached screenshot as an example. the code is in evaluateInterviewAgent folder.

# ，获取视频地址,对应curl
curl --location --request GET 'https://report-agent.gohire.top/gohire-data/gohireApi/chat_logs?request_introduction_id=54f03f96-10d6-4167-97b3-dae0bfb4398a'
响应结果 ：
{
    "success": true,
    "data": [
        {
            "log_id": "bdc4255e-3a87-4435-a511-b4314b9a2180",
            "request_introduction_id": "54f03f96-10d6-4167-97b3-dae0bfb4398a",
            "video_url": "https://gohire-recordings-v3.oss-cn-shanghai.aliyuncs.com/recordings/2025/11/23/interview_zhendongchen@emotibot.com_811174117_7680_20251123_110543.mp4",
            "resume_url": "https://hr.gohire.top/serverApi/api/resume/download/c467a9d0-5f3e-491a-b825-0649dbedb6c0"
        }
    ],
    "total": 1
}
字段说明
 video_url 面试视频地址
 resume_url 简历下载地址

# 获取面试记录,对应curl
curl --location --request GET 'https://report-agent.gohire.top/gohire-data/gohireApi/chat_dialog?request_introduction_id=54f03f96-10d6-4167-97b3-dae0bfb4398a'
响应结果 ：
{
    "success": true,
    "log_id": "bdc4255e-3a87-4435-a511-b4314b9a2180",
    "dialog": [
        {
            "user_time": 27570,
            "id": "25487ff0-d759-439e-b220-e5f461417693",
            "question": "您好！欢迎参加本次面试。我们是做华为外包的，主要为华为项目提供技术支持，您能接触到华为的项目流程和技术规范。薪资方面具有竞争力，而且五险一金都是全额缴纳，法定福利这些基础保障都到位，不用额外操心。\n\n请先确保麦克风和摄像头设备正常工作，然后请您先做个简单的自我介绍吧。",
            "log_id": "bdc4255e-3a87-4435-a511-b4314b9a2180",
            "created_by": null,
            "updated_by": null,
            "other": {
                "original_answer": "好的好的好的好的。 好的好的好的好的。",
                "review_info": {
                    "relation": false,
                    "reason": "问答没有相关性"
                }
            },
            "feedback": null,
            "video_time": 0,
            "answer": "好的好的好的好的。好的好的好的好的。",
            "created_at": "2025-11-23T19:06:05.405416+08:00",
            "updated_at": "2026-03-14T19:32:22.088235+08:00",
            "more_info": null
        }
    ]
}
字段解释：
question：llm 提问
answer：用户回答