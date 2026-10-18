from verify.names import name_status


def test_tamil_title_in_display_name_is_ignored():
    assert name_status("டாக்டர் அருண் குமார்", "Arun Kumar")[0] == "pass"
    assert name_status("திருமதி கவிதா", "Kavitha")[0] == "pass"


def test_initial_on_one_side_passes_but_different_initials_do_not():
    assert name_status("Dr. Arun Kumar", "R Arun Kumar")[0] == "pass"
    assert name_status("S Arun Kumar", "R Arun Kumar")[0] == "review"
    assert name_status("Dr. Arun Kumar", "Senthil Murugan")[0] == "fail"
