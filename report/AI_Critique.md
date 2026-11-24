# AI Critique – HW05

## 1. AI sai, thiên lệch hoặc thiếu ở đâu?

Khi sinh test plan, AI đặt timer trong Transaction Controller, nên lúc hết Duration JMeter vẫn ghi sample transaction 0 ms success. AI lấy gợi ý chung làm thông số Stress (trần 200 VU, think 0,5–1 s), chạy 10 phút SUT không gãy, chỉ khoảng 300 req/s. Khi phân tích, AI chốt điểm gãy 350 VU chỉ vì một đợt chậm khoảng 10 s, trong khi bậc 400 VU trở lại bình thường. O6 nói `better-sqlite3` "đọc song song trên nhiều core" là hallucinated, vì thư viện này chạy đồng bộ. O7 đề xuất `cluster` nhưng bỏ sót `initDatabase()` chạy `DROP TABLE` mỗi khi process khởi động. Bù lại, AI chỉ ra đúng một điểm em suýt bỏ qua: percentile trong `statistics.json` chỉ tính trên cửa sổ 20.000 sample.

## 2. Vì sao AI không phát hiện ra?

AI không tự chạy test plan nên không thấy cách JMeter dừng thread hay năng lực thật của máy. Khi đọc kết quả, AI dựa vào số tổng từng bậc, không xem phân bố theo thời gian, nên một đợt chậm ngắn bị coi là xu hướng. Với đề xuất tối ưu, AI trả lời theo kiến thức chung, không đọc kỹ source SUT.

## 3. Nguyên tắc em rút ra

- Chạy thử nhỏ và cố ý làm sai trước khi tin test plan do AI sinh.
- Chạy dò năng lực máy rồi mới chốt số VU.
- Kiểm lại mọi kết luận của AI bằng số trong `.jtl`, chia theo thời gian.
- Đối chiếu đề xuất tối ưu với source thật trước khi ghi vào report.
