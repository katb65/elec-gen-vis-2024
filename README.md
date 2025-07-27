# elec-gen-vis-2024
Visualization of EIA US electricity generation data split by fuel source, with dropdown choice of year &amp; state and options for which energies are clean; plus capacities from NREL.

HTML, JS, and CSS work together to create the webpage which works in real-time off the EIA API. The Python file is separate, used to pre-process the large NREL data files so they can be used by the JS more quickly (converts the included *NREL.csv files into the *NREL_condensed.csv files)

Avenues for improvement if creating a larger scale project include: 
- Caching EIA data with timestamps in separate file, to fetch less frequently; or rearranging code to make less API calls generally
- Hosting dummy EIA API data for rigorous testing of pull & display accuracy
- Better adjustment of CSS to each user's view window size
- Obfuscating JavaScript visibility in Inspect Element on hosting site

![image](https://github.com/user-attachments/assets/793b9186-47a2-45d3-a967-5c9e6ea06985)

![image](https://github.com/user-attachments/assets/3dfed353-8961-4d95-af09-c2a0a7f7daf4)

![image](https://github.com/user-attachments/assets/c3bb4b42-8784-449b-b843-ec5df033decd)


